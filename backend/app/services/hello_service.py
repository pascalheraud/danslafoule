from app.repositories.hello_repository import HelloRepository


class HelloService:
    def __init__(self, repository: HelloRepository) -> None:
        self._repository = repository

    def count_worlds(self) -> int:
        return self._repository.count()
