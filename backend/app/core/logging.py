import functools
import inspect
import logging
import time
from collections.abc import Callable
from typing import ParamSpec, TypeVar

from asgi_correlation_id import CorrelationIdFilter

from app.core.config import settings

P = ParamSpec("P")
T = TypeVar("T")

services_logger = logging.getLogger("app.services")


def configure_logging() -> None:
    """Sets up the app's logging: one stream handler on the root logger, with
    the request-correlation id (per [[asgi-correlation-id]]) injected into
    every line via a filter, so HTTP, SQL, and application log lines for the
    same request all carry the same id. Also turns on SQLAlchemy's own query
    logger when settings.sql_echo is set — see [[sqlalchemy]]'s "Query
    logging" convention.
    """
    handler = logging.StreamHandler()
    handler.addFilter(CorrelationIdFilter(uuid_length=8, default_value="-"))
    handler.setFormatter(logging.Formatter("%(levelname)s [%(correlation_id)s] %(name)s: %(message)s"))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)

    logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO if settings.sql_echo else logging.WARNING)


def logged(func: Callable[P, T]) -> Callable[P, T]:
    """Logs an INFO line when the wrapped service method starts and another
    when it ends (with its duration) — per [[api]]'s "service-level
    start/end" logging convention, using [[backend/python/logging]]'s
    Option 1 (explicit decorator), the choice recorded in this project's
    skill.
    """
    if inspect.iscoroutinefunction(func):

        @functools.wraps(func)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            services_logger.info("start %s", func.__qualname__)
            start = time.monotonic()
            try:
                return await func(*args, **kwargs)  # type: ignore[no-any-return]
            finally:
                services_logger.info(
                    "end %s (%.1fms)", func.__qualname__, (time.monotonic() - start) * 1000
                )

        return async_wrapper  # type: ignore[return-value]

    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        services_logger.info("start %s", func.__qualname__)
        start = time.monotonic()
        try:
            return func(*args, **kwargs)
        finally:
            services_logger.info("end %s (%.1fms)", func.__qualname__, (time.monotonic() - start) * 1000)

    return wrapper
