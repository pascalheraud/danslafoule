from sqlalchemy.orm import Session

from app.domain.hello import HelloWorld
from app.repositories.hello_repository import HelloRepository


def test_count_returns_zero_when_table_empty(db_session: Session) -> None:
    assert HelloRepository(db_session).count() == 0


def test_count_returns_number_of_rows(db_session: Session) -> None:
    db_session.add_all([HelloWorld(), HelloWorld(), HelloWorld()])
    db_session.commit()

    assert HelloRepository(db_session).count() == 3
