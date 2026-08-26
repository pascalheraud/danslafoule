import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.messages import router as messages_router
from app.core.config import settings
from app.core.database import SCHEMA, Base, engine
from app.core.logging import configure_logging

# Imported for its side effect of registering the model on Base.metadata
# before create_all() runs below.
from app.domain import message  # noqa: F401
from app.services.message_purge import run_purge_loop

configure_logging()
requests_logger = logging.getLogger("app.requests")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    purge_task = asyncio.create_task(run_purge_loop())
    try:
        yield
    finally:
        purge_task.cancel()
        with suppress(asyncio.CancelledError):
            await purge_task


app = FastAPI(title="Dans la foule API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):  # type: ignore[no-untyped-def]
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    # request.url (not request.url.path) carries the query string, so GET
    # parameters are logged too — path params are already part of the path.
    requests_logger.info("%s %s -> %s (%.1fms)", request.method, request.url, response.status_code, duration_ms)
    return response


# Added last so it's the outermost middleware and runs first — the
# correlation id must already be set before log_requests above (and any SQL
# query logging during the request) emits its log line.
app.add_middleware(CorrelationIdMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Malformed envelopes (§5, §8.1 of the protocol spec) must be rejected as 400,
    # not FastAPI's default 422, per the relay endpoints' contract.
    errors = [{k: v for k, v in error.items() if k != "ctx"} for error in exc.errors()]
    return JSONResponse(status_code=400, content=jsonable_encoder({"detail": errors}))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(messages_router, prefix="/api/v1")

class SPAStaticFiles(StaticFiles):
    """Falls back to index.html for any path StaticFiles can't resolve.

    Needed for React Router's client-side routes (e.g. /groups/:id): a
    direct navigation or reload on one of those is a real GET to the
    backend, which has no matching file and would otherwise 404 instead of
    handing control back to the client-side router.
    """

    async def get_response(self, path: str, scope):  # type: ignore[no-untyped-def]
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", SPAStaticFiles(directory=frontend_dist, html=True), name="frontend")
