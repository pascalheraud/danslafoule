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


settings = Settings()
