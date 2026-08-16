import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain.message import Message


class MessageRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, message_uuid: uuid.UUID, content: str) -> Message:
        message = Message(uuid=message_uuid, content=content)
        self._db.add(message)
        self._db.flush()
        return message

    def list_since(self, since: datetime | None) -> list[Message]:
        query = select(Message).order_by(Message.received_at)
        if since is not None:
            query = query.where(Message.received_at > since)
        return list(self._db.scalars(query))

    def delete_expired(self, cutoff: datetime) -> int:
        result = self._db.execute(delete(Message).where(Message.received_at < cutoff))
        return result.rowcount
