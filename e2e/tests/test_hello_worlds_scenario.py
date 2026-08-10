from playwright.sync_api import Page

from pages.hello_page import HelloPage
from testdata import DanslafouleTestDataBuilder


def test_hello_worlds_displays_the_row_count(page: Page, app_url: str, builder: DanslafouleTestDataBuilder) -> None:
    # Given 3 rows seeded in the hello_worlds table
    builder.new_hello_worlds(3)
    builder.apply()

    # When opening the app
    hello_page = HelloPage.open(page, app_url)

    # Then the page displays the matching Hello n worlds message
    assert hello_page.message() == "Hello 3 worlds !"


def test_hello_worlds_displays_zero_when_table_is_empty(page: Page, app_url: str, builder: DanslafouleTestDataBuilder) -> None:
    # Given no rows in the hello_worlds table
    builder.apply()

    # When opening the app
    hello_page = HelloPage.open(page, app_url)

    # Then the page displays zero worlds
    assert hello_page.message() == "Hello 0 worlds !"
