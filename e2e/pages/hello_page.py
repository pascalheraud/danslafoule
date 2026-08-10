from playwright.sync_api import Page


class HelloPage:
    def __init__(self, page: Page) -> None:
        self._page = page

    @staticmethod
    def open(page: Page, base_url: str) -> "HelloPage":
        page.goto(base_url)
        return HelloPage(page)

    def message(self) -> str:
        locator = self._page.get_by_text("Hello", exact=False)
        locator.wait_for()
        return locator.inner_text()
