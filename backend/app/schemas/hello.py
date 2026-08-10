from pydantic import BaseModel


class HelloCountResponse(BaseModel):
    n: int
