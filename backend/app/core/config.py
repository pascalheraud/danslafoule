from datetime import timedelta
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchored to this file, not the process cwd, so it resolves the same way
# whether the app/tests are launched from the repo root, backend/, or elsewhere.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env.dev"


class Settings(BaseSettings):
    # .env.dev (committed) provides local dev values; a real DATABASE_URL
    # env var always takes precedence, for staging/prod.
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_prefix="")

    database_url: str
    # Fixed at 1h to match the relay's purge rule (protocol spec §8.3: "a
    # simple, fixed rule... independent of the ttl carried by each envelope").
    # Exposed as a setting (rather than a hardcoded constant) for testability,
    # not because it's meant to vary per deployment.
    message_ttl_hours: float = 1
    log_level: str = "INFO"
    sql_echo: bool = False
    # Web dev origin by default; a real deployment adds the Capacitor native
    # app's origin (e.g. "https://localhost" for Android) via the
    # CORS_ORIGINS env var (JSON list), on top of the web app's own origin.
    cors_origins: list[str] = ["http://localhost:5173"]

    @property
    def message_ttl(self) -> timedelta:
        return timedelta(hours=self.message_ttl_hours)


settings = Settings()
