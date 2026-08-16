from playwright.sync_api import Page


class AppPage:
    """Facade over the single-page app's onboarding / home / group screens.

    The app has no real routing (state-based screen switching), so this is
    one page object rather than one per screen — the underlying DOM is
    always the same document.
    """

    def __init__(self, page: Page) -> None:
        self._page = page

    @staticmethod
    def open(page: Page, base_url: str, device_uuid: str | None = None) -> "AppPage":
        if device_uuid:
            page.add_init_script(f"window.localStorage.setItem('dlf:device-uuid', '{device_uuid}');")
        page.goto(base_url)
        return AppPage(page)

    def is_onboarding_visible(self) -> bool:
        try:
            self._page.get_by_text("Welcome to Dans la foule").wait_for(timeout=3000)
            return True
        except Exception:
            return False

    def complete_onboarding(self, name: str) -> None:
        self._page.locator('ix-input[name="user-name"] input').fill(name)
        # exact=False: the button carries a trailing icon, which makes its
        # computed accessible text no longer exactly equal "Continue".
        self._page.get_by_text("Continue").click()
        self.wait_for_home()

    def wait_for_home(self) -> None:
        self._page.get_by_text("Your groups", exact=True).wait_for()

    def create_group(self, name: str) -> None:
        self._page.locator('ix-input[name="create-group-name"] input').fill(name)
        self._page.get_by_text("Create group").click()
        self._page.locator('[data-testid="group-uuid"]').wait_for()

    def join_group(self, group_uuid: str) -> None:
        self._page.locator('ix-input[name="join-group-uuid"] input').fill(group_uuid)
        self._page.get_by_text("Join group").click()
        self._page.locator('[data-testid="group-uuid"]').wait_for()

    def open_group_card(self, group_uuid: str) -> None:
        self._page.locator(f'ix-card[data-group-uuid="{group_uuid}"]').click()
        self._page.locator('[data-testid="group-uuid"]').wait_for()

    def group_names(self) -> list[str]:
        return self._page.locator('ix-card[data-testid="group-card"] ix-typography').all_inner_texts()

    def group_uuid(self) -> str:
        return self._page.locator('[data-testid="group-uuid"]').inner_text()

    def send_message(self, text: str) -> None:
        self._page.locator('ix-input[name="message-text"] input').fill(text)
        self._page.locator('[data-testid="send-message-button"]').click()

    def message_contents(self) -> list[str]:
        return self._page.locator('[data-testid="message-content"]').all_inner_texts()

    def wait_for_message(self, content: str, timeout: float = 10000) -> None:
        self._page.locator('[data-testid="message-content"]').filter(has_text=content).first.wait_for(
            timeout=timeout
        )
