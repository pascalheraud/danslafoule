from enum import Enum

from testdatabuilder.generic import TestColumn, TestTable

SCHEMA = "danslafoule"


class HelloWorldColumn(TestColumn, Enum):
    ID = "id"
    CREATED_AT = "created_at"

    @property
    def sql_name(self) -> str:
        return self.value


class DanslafouleTable(TestTable, Enum):
    HELLO_WORLD = ("hello_worlds", HelloWorldColumn)

    def __init__(self, table_name: str, column_enum: type[HelloWorldColumn]) -> None:
        self._table_name = table_name
        self._column_enum = column_enum

    @property
    def sql_name(self) -> str:
        return f"{SCHEMA}.{self._table_name}"

    @property
    def columns(self) -> list[HelloWorldColumn]:
        return list(self._column_enum)
