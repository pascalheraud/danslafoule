import re

from playwright.sync_api import Browser, BrowserContext, Locator, Page

# Copying an invite goes through navigator.clipboard, so any context that
# needs AppPage.copy_invite() must be granted these up front (Playwright
# defaults to no clipboard permission, which hangs writeText()/readText()
# rather than raising). The default `page` fixture gets this via conftest's
# browser_context_args override; contexts opened by hand (multi-device
# scenarios) must ask for it explicitly via open_in_new_context().
CLIPBOARD_PERMISSIONS = ["clipboard-read", "clipboard-write"]

GROUP_URL_PATTERN = re.compile(r".*/groups/[^/]+/?$")


class AppPage:
    """Facade over the single-page app's onboarding / home / group screens."""

    def __init__(self, page: Page) -> None:
        self._page = page

    @staticmethod
    def open(page: Page, base_url: str) -> "AppPage":
        page.goto(base_url)
        return AppPage(page)

    @staticmethod
    def open_in_new_context(browser: Browser, base_url: str) -> tuple[BrowserContext, "AppPage"]:
        context = browser.new_context(permissions=CLIPBOARD_PERMISSIONS)
        return context, AppPage.open(context.new_page(), base_url)

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
        self._page.wait_for_url(GROUP_URL_PATTERN)
        self._page.locator('[data-testid="send-message-button"]').wait_for()

    def join_group(self, invite: str) -> None:
        self._page.locator('ix-input[name="join-group-invite"] input').fill(invite)
        self._page.get_by_text("Join group").click()
        self._page.wait_for_url(GROUP_URL_PATTERN)
        self._page.locator('[data-testid="send-message-button"]').wait_for()

    def group_id(self) -> str:
        # No dedicated "group id" element on screen (unlike the old flat
        # messaging feature) — the group screen's own URL is the only
        # stable place it's exposed, since joining needs the full invite
        # (group id + key), not the bare id.
        return self._page.url.rstrip("/").rsplit("/groups/", 1)[1]

    def copy_invite(self) -> str:
        self._page.get_by_text("Copy invite").click()
        self._page.get_by_text("Invite copied to clipboard").wait_for()
        return self._page.evaluate("navigator.clipboard.readText()")

    def open_group_card(self, group_name: str) -> None:
        self.group_card(group_name).get_by_text(group_name, exact=True).click()
        self._page.wait_for_url(GROUP_URL_PATTERN)

    def group_names(self) -> list[str]:
        return self._page.locator('ix-card[data-testid="group-card"] ix-typography').all_inner_texts()

    def send_message(self, text: str) -> None:
        self._page.locator('ix-input[name="message-text"] input').fill(text)
        self._page.locator('[data-testid="send-message-button"]').click()

    def message_contents(self) -> list[str]:
        return self._page.locator('[data-testid="message-content"]').all_inner_texts()

    def wait_for_message(self, content: str, timeout: float = 10000) -> None:
        self._page.locator('[data-testid="message-content"]').filter(has_text=content).first.wait_for(
            timeout=timeout
        )

    def message_bubbles(self) -> Locator:
        return self._page.locator('[data-testid="message-item"][data-kind="chat"]')

    def message_background_colors(self) -> list[str]:
        return self.message_bubbles().evaluate_all(
            "(nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor)"
        )

    def group_card(self, group_name: str) -> Locator:
        return self._page.locator('[data-testid="group-card"]').filter(has_text=group_name).first

    def group_card_badge(self, group_name: str) -> Locator:
        return self.group_card(group_name).locator('[data-testid="group-card-unread-badge"]')

    def wait_for_group_card_badge(self, group_name: str, count: int, timeout: float = 10000) -> None:
        self.group_card_badge(group_name).wait_for(timeout=timeout)
        assert self.group_card_badge(group_name).inner_text() == str(count)

    def menu_group_item(self, group_name: str) -> Locator:
        return self._page.locator('[data-testid="menu-group-item"]').filter(has_text=group_name).first

    def menu_badge(self, group_name: str) -> Locator:
        return self.menu_group_item(group_name).locator('[data-testid="menu-unread-badge"]')

    def header_badge(self) -> Locator:
        return self._page.locator('[data-testid="header-active-group"] [data-testid="header-unread-badge"]')

    def unread_badge_in_group(self) -> Locator:
        return self._page.locator('[data-testid="unread-badge"]')

    def wait_for_badge_to_disappear(self, locator: Locator, timeout: float = 10000) -> None:
        locator.wait_for(state="hidden", timeout=timeout)

    def wait_for_menu_badge_to_disappear(self, group_name: str, timeout: float = 10000) -> None:
        self.menu_badge(group_name).wait_for(state="hidden", timeout=timeout)

    def wait_for_header_badge_to_disappear(self, timeout: float = 10000) -> None:
        self.header_badge().wait_for(state="hidden", timeout=timeout)

    def wait_for_group_to_have_no_unread_badge(self, group_name: str) -> None:
        self.group_card_badge(group_name).wait_for(state="hidden")

    def has_ack_for_group(self, group_id: str) -> bool:
        # Acks (§6.5) have no UI surface at all — they're purely a protocol
        # bookkeeping fact recipients auto-emit and senders auto-record, so
        # asserting an ack happened means reading the IndexedDB store
        # directly (schema per doc/dans-la-foule-protocol-spec-en.md §11,
        # `features/protocol/messages.ts`'s ackState shape: groupId ->
        # messageId -> ackerPub[]), not the DOM. No single message id is
        # exposed in the DOM to key on, so this checks "any acked message
        # in this group" rather than a specific message.
        return self._page.evaluate(
            """
            async (groupId) => {
              const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open("danslafoule-protocol", 1);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
              });
              const ackState = await new Promise((resolve, reject) => {
                const req = db.transaction("messages", "readonly").objectStore("messages").get("ackState");
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
              });
              const group = (ackState ?? {})[groupId] ?? {};
              return Object.values(group).some((ackers) => ackers.length > 0);
            }
            """,
            group_id,
        )
