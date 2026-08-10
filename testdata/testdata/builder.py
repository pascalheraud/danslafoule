from datetime import datetime, timezone

from testdatabuilder.generic import Data, TestDataBuilder

from testdata.tables import DanslafouleTable, HelloWorldColumn


class DanslafouleTestDataBuilder(TestDataBuilder):
    def new_hello_world(self) -> Data:
        hello_world = self._new_data(DanslafouleTable.HELLO_WORLD)
        return self._register(hello_world.set_column(HelloWorldColumn.CREATED_AT, datetime.now(timezone.utc)))

    def new_hello_worlds(self, count: int) -> list[Data]:
        return [self.new_hello_world() for _ in range(count)]
