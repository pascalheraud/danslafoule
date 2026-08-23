from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.domain.message import Message
from app.repositories.message_repository import MessageRepository
from tests.envelope_factory import make_envelope


def test_save_then_list_since_none_returns_the_message(db_session: Session) -> None:
    repo = MessageRepository(db_session)
    envelope = make_envelope()

    repo.save(envelope["messageId"], envelope["groupId"], envelope)

    results = repo.list_since(envelope["groupId"], since=None)
    assert [m.envelope for m in results] == [envelope]


def test_list_since_excludes_messages_at_or_before_the_given_cursor(db_session: Session) -> None:
    repo = MessageRepository(db_session)
    group_id = "11111111-1111-1111-1111-111111111111"
    old = make_envelope(group_id=group_id)
    repo.save(old["messageId"], group_id, old)
    [old_row] = repo.list_since(group_id, since=None)

    new = make_envelope(group_id=group_id)
    repo.save(new["messageId"], group_id, new)

    results = repo.list_since(group_id, since=old_row.cursor)
    assert [m.envelope for m in results] == [new]


def test_list_since_filters_by_group(db_session: Session) -> None:
    repo = MessageRepository(db_session)
    group_a = "11111111-1111-1111-1111-111111111111"
    group_b = "22222222-2222-2222-2222-222222222222"
    envelope_a = make_envelope(group_id=group_a)
    envelope_b = make_envelope(group_id=group_b)
    repo.save(envelope_a["messageId"], group_a, envelope_a)
    repo.save(envelope_b["messageId"], group_b, envelope_b)

    results = repo.list_since(group_a, since=None)
    assert [m.envelope for m in results] == [envelope_a]


def test_save_resend_keeps_content_refreshes_received_at_and_bumps_cursor(db_session: Session) -> None:
    repo = MessageRepository(db_session)
    envelope = make_envelope()
    group_id = envelope["groupId"]
    repo.save(envelope["messageId"], group_id, envelope)
    [original] = repo.list_since(group_id, since=None)
    # SQLAlchemy's identity map would otherwise hand back the *same* Python
    # object below and this would trivially compare equal to itself — capture
    # the plain value before the resend mutates it in place.
    original_cursor = original.cursor

    repo.save(envelope["messageId"], group_id, envelope)

    [resent] = repo.list_since(group_id, since=None)
    assert resent.envelope == envelope
    assert resent.received_at > datetime.now(timezone.utc) - timedelta(minutes=1)
    # The bumped cursor is what makes the resend visible again to a client
    # that already polled past the original cursor (protocol spec §6.5).
    assert resent.cursor > original_cursor
    assert repo.list_since(group_id, since=original_cursor) != []


def test_purge_older_than_deletes_only_stale_rows(db_session: Session) -> None:
    repo = MessageRepository(db_session)
    group_id = "11111111-1111-1111-1111-111111111111"
    stale = make_envelope(group_id=group_id)
    fresh = make_envelope(group_id=group_id)
    db_session.add(
        Message(
            message_id=stale["messageId"],
            group_id=group_id,
            envelope=stale,
            received_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
    )
    db_session.commit()
    repo.save(fresh["messageId"], group_id, fresh)

    deleted = repo.purge_older_than(datetime.now(timezone.utc) - timedelta(hours=1))

    assert deleted == 1
    results = repo.list_since(group_id, since=None)
    assert [m.envelope for m in results] == [fresh]
