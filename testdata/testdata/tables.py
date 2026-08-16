from enum import Enum

from testdatabuilder.generic import TestColumn, TestTable

SCHEMA = "danslafoule"


class MessageColumn(TestColumn, Enum):
    ID = "id"
    UUID = "uuid"
    CONTENT = "content"
    RECEIVED_AT = "received_at"
    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"

    @property
    def sql_name(self) -> str:
        return self.value


class DanslafouleTable(TestTable, Enum):
    MESSAGE = ("message", MessageColumn)

    def __init__(self, table_name: str, column_enum: type[TestColumn]) -> None:
        self._table_name = table_name
        self._column_enum = column_enum

    @property
    def sql_name(self) -> str:
        return f"{SCHEMA}.{self._table_name}"

    @property
    def columns(self) -> list[TestColumn]:
        return list(self._column_enum)
