import uuid as uuid_lib
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, Sequence, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Backs Message.cursor: a single, monotonically increasing counter shared by
# every row's insert *and* every resend-touch (see MessageRepository.save),
# so polling clients can use a plain "give me everything past cursor N"
# query — an actual index, not a wall-clock value subject to skew/precision
# rounding between the client and the server.
message_cursor_seq = Sequence("message_cursor_seq", schema=Base.metadata.schema, metadata=Base.metadata)


class Message(Base):
    __tablename__ = "message"
    __table_args__ = (Index("idx_message_group_cursor", "group_id", "cursor"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Business identifier (protocol spec §5's messageId), not the technical PK
    # — per this project's PK convention (bigint identity PK + separate
    # business identifier column).
    message_id: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    group_id: Mapped[uuid_lib.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    envelope: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # The opaque polling cursor (see message_cursor_seq above). Set from
    # nextval() on both insert and resend-update by the repository — never
    # read the sequence directly anywhere else.
    cursor: Mapped[int] = mapped_column(BigInteger, message_cursor_seq, nullable=False, unique=True)
    # clock_timestamp(), not now(): now() is frozen at transaction start in
    # Postgres, so two messages inserted in the same transaction would get
    # an identical received_at — clock_timestamp() gives the real wall-clock
    # time of each insert. Distinct from created_at: this is the protocol's
    # own receipt timestamp that TTL purge keys off (§8.3) — polling/"since"
    # keys off `cursor` instead, not this column.
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
