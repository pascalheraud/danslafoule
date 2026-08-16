import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.message import Message
from app.repositories.message_repository import MessageRepository
from app.services.message_service import MessageService


def test_post_creates_message_with_server_received_at(db_session: Session) -> None:
    service = MessageService(MessageRepository(db_session))

    message = service.post(uuid.uuid4(), "hello")

    assert message.content == "hello"
    assert message.received_at is not None


def test_list_since_none_returns_all_non_expired_messages(db_session: Session) -> None:
    service = MessageService(MessageRepository(db_session))
    service.post(uuid.uuid4(), "first")
    service.post(uuid.uuid4(), "second")

    messages = service.list_since(None)

    assert [m.content for m in messages] == ["first", "second"]


def test_list_since_excludes_older_messages(db_session: Session) -> None:
    service = MessageService(MessageRepository(db_session))
    service.post(uuid.uuid4(), "old")
    cutoff = datetime.now(timezone.utc)
    service.post(uuid.uuid4(), "new")

    messages = service.list_since(cutoff)

    assert [m.content for m in messages] == ["new"]


def test_expired_messages_are_purged_on_post(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "message_ttl_hours", 1)
    stale = Message(uuid=uuid.uuid4(), content="stale")
    db_session.add(stale)
    db_session.flush()
    stale.received_at = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.flush()

    service = MessageService(MessageRepository(db_session))
    service.post(uuid.uuid4(), "fresh")

    remaining = service.list_since(None)
    assert [m.content for m in remaining] == ["fresh"]


def test_expired_messages_are_purged_on_list(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "message_ttl_hours", 1)
    stale = Message(uuid=uuid.uuid4(), content="stale")
    db_session.add(stale)
    db_session.flush()
    stale.received_at = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.flush()

    service = MessageService(MessageRepository(db_session))

    assert service.list_since(None) == []
