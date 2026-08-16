import asyncio
from datetime import datetime, timezone

from app.core.config import settings
from app.core.database import SessionLocal
from app.repositories.message_repository import MessageRepository
from app.services.message_service import MessageService

PURGE_INTERVAL_SECONDS = 60


def purge_once() -> int:
    with SessionLocal() as db:
        service = MessageService(MessageRepository(db))
        return service.purge_older_than(datetime.now(timezone.utc) - settings.message_ttl)


async def run_purge_loop() -> None:
    while True:
        await asyncio.sleep(PURGE_INTERVAL_SECONDS)
        purge_once()
