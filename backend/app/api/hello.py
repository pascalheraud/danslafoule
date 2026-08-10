from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.hello_repository import HelloRepository
from app.schemas.hello import HelloCountResponse
from app.services.hello_service import HelloService

router = APIRouter()


def get_hello_service(db: Session = Depends(get_db)) -> HelloService:
    return HelloService(HelloRepository(db))


@router.get("/hello-count", response_model=HelloCountResponse)
def get_hello_count(service: HelloService = Depends(get_hello_service)) -> HelloCountResponse:
    return HelloCountResponse(n=service.count_worlds())
