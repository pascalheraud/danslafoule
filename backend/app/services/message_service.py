import logging
import uuid
from datetime import datetime, timezone

from app.core.config import settings
from app.core.logging import logged
from app.domain.message import Message
from app.repositories.message_repository import MessageRepository

batch_logger = logging.getLogger("app.batch")


class MessageService:
    def __init__(self, repository: MessageRepository) -> None:
        self._repository = repository

    def _purge_expired(self) -> None:
        cutoff = datetime.now(timezone.utc) - settings.message_ttl
        batch_logger.info("start purge_expired_messages (cutoff=%s, ttl=%s)", cutoff, settings.message_ttl)
        deleted = self._repository.delete_expired(cutoff)
        batch_logger.info("end purge_expired_messages (deleted=%d)", deleted)

    @logged
    def post(self, message_uuid: uuid.UUID, content: str) -> Message:
        self._purge_expired()
        return self._repository.create(message_uuid, content)

    @logged
    def list_since(self, since: datetime | None) -> list[Message]:
        self._purge_expired()
        return self._repository.list_since(since)
