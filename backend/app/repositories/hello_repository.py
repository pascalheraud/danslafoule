from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.hello import HelloWorld


class HelloRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def count(self) -> int:
        return self._db.scalar(select(func.count()).select_from(HelloWorld)) or 0
