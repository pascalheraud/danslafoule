import uuid as uuid_lib
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Message(Base):
    __tablename__ = "message"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    uuid: Mapped[uuid_lib.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    content: Mapped[str] = mapped_column(String, nullable=False)
    # clock_timestamp(), not now(): now() is frozen at transaction start in
    # Postgres, so two messages inserted in the same transaction would get
    # an identical received_at — clock_timestamp() gives the real wall-clock
    # time of each insert.
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp(), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
