from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.message_repository import MessageRepository
from app.schemas.message import MessageCreateRequest, MessageResponse
from app.services.message_service import MessageService

router = APIRouter()


def get_message_service(db: Session = Depends(get_db)) -> MessageService:
    return MessageService(MessageRepository(db))


@router.post("/messages", response_model=MessageResponse)
def post_message(
    payload: MessageCreateRequest, service: MessageService = Depends(get_message_service)
) -> MessageResponse:
    message = service.post(payload.uuid, payload.content)
    return MessageResponse(uuid=message.uuid, content=message.content, received_at=message.received_at)


@router.get("/messages", response_model=list[MessageResponse])
def list_messages(
    since: datetime | None = Query(default=None),
    service: MessageService = Depends(get_message_service),
) -> list[MessageResponse]:
    messages = service.list_since(since)
    return [MessageResponse(uuid=m.uuid, content=m.content, received_at=m.received_at) for m in messages]
