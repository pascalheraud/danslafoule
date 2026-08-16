import uuid
from datetime import datetime

from pydantic import BaseModel


class MessageCreateRequest(BaseModel):
    uuid: uuid.UUID
    content: str


class MessageResponse(BaseModel):
    uuid: uuid.UUID
    content: str
    received_at: datetime
