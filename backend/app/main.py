import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.messages import router as messages_router
from app.core.database import SCHEMA, Base, engine
from app.core.logging import configure_logging

# Imported for its side effect of registering the model on Base.metadata
# before create_all() runs below.
from app.domain import message  # noqa: F401

configure_logging()
requests_logger = logging.getLogger("app.requests")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Dans la foule API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(messages_router, prefix="/api")

frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
