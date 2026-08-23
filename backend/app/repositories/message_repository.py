from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain.message import Message, message_cursor_seq


class MessageRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def save(self, message_id: str, group_id: UUID, envelope: dict) -> None:
        existing = self._db.scalar(select(Message).where(Message.message_id == message_id))
        if existing is not None:
            # Resend (protocol spec §6.5/§8.3): keep the (unchanged) envelope
            # content, but bump `cursor` to a fresh value — this is what
            # makes the resend visible again to clients whose polling cursor
            # already passed the original one — and refresh received_at so
            # it gets a fresh 1h purge horizon.
            now = datetime.now(timezone.utc)
            existing.envelope = envelope
            existing.cursor = self._db.scalar(select(message_cursor_seq.next_value()))
            existing.received_at = now
            existing.updated_at = now
        else:
            self._db.add(Message(message_id=message_id, group_id=group_id, envelope=envelope))
        self._db.commit()

    def list_since(self, group_id: UUID, since: int | None) -> list[Message]:
        stmt = select(Message).where(Message.group_id == group_id)
        if since is not None:
            stmt = stmt.where(Message.cursor > since)
        stmt = stmt.order_by(Message.cursor)
        return list(self._db.scalars(stmt))

    def purge_older_than(self, cutoff: datetime) -> int:
        result = self._db.execute(delete(Message).where(Message.received_at < cutoff))
        self._db.commit()
        return result.rowcount
