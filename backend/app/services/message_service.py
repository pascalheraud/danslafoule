from datetime import datetime
from uuid import UUID

from app.core.logging import logged
from app.repositories.message_repository import MessageRepository
from app.schemas.envelope import Envelope


class GroupIdMismatchError(ValueError):
    pass


class MessageService:
    def __init__(self, repository: MessageRepository) -> None:
        self._repository = repository

    @logged
    def submit(self, group_id: UUID, envelope: Envelope) -> None:
        if envelope.group_id != group_id:
            raise GroupIdMismatchError("groupId in the path must match groupId in the envelope")
        self._repository.save(
            message_id=envelope.message_id,
            group_id=group_id,
            envelope=envelope.model_dump(by_alias=True, mode="json"),
        )

    @logged
    def list_since(self, group_id: UUID, since: int | None) -> list[dict]:
        # `cursor` is an opaque, monotonically increasing integer (see
        # domain/message.py's message_cursor_seq) — callers must pass back a
        # previously-seen `cursor` value as their next `since`, not a
        # timestamp of their own. It also advances on a resend (§6.5), so a
        # rebroadcast message becomes visible again to clients who'd already
        # polled past its original position.
        return [
            {"envelope": message.envelope, "cursor": message.cursor}
            for message in self._repository.list_since(group_id, since)
        ]

    @logged
    def purge_older_than(self, cutoff: datetime) -> int:
        return self._repository.purge_older_than(cutoff)
