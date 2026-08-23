from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import check_rate_limit
from app.repositories.message_repository import MessageRepository
from app.schemas.envelope import Envelope
from app.services.message_service import GroupIdMismatchError, MessageService

router = APIRouter()


def get_message_service(db: Session = Depends(get_db)) -> MessageService:
    return MessageService(MessageRepository(db))


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/groups/{group_id}/messages", status_code=status.HTTP_201_CREATED)
def post_message(
    group_id: UUID,
    envelope: Envelope,
    request: Request,
    service: MessageService = Depends(get_message_service),
) -> dict[str, str]:
    if not check_rate_limit(f"post:{_client_key(request)}"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate limited")
    try:
        service.submit(group_id, envelope)
    except GroupIdMismatchError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"status": "accepted"}


@router.get("/groups/{group_id}/messages")
def list_messages(
    group_id: UUID,
    since: int | None = Query(
        default=None,
        description=(
            "Opaque, monotonically increasing cursor — not a timestamp. Pass the `cursor` from a "
            "previous response's item to get only what's new since then. Omit to fetch everything "
            "still within the relay's retention window."
        ),
    ),
    service: MessageService = Depends(get_message_service),
) -> list[dict]:
    return service.list_since(group_id, since)
