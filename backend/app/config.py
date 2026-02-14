import logging
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    SMALLEST_API_KEY: str
    GOOGLE_API_KEY: str | None = None
    SMALLEST_VOICE_ID: str | None = "sophia"

    APP_ENV: str = "development"
    PORT: int = 8000
    LIGHTNING_API_URL: str = "https://waves-api.smallest.ai/api/v1/lightning-v3.1/stream"
    LIGHTNING_MODEL: str = "lightning"
    LIGHTNING_SAMPLE_RATE: int = 24000
    LIGHTNING_OUTPUT_FORMAT: str = "pcm"


def get_settings() -> Settings:
    """Load and validate settings. Raises ValidationError if required vars are missing."""
    return Settings()


def setup_logging(level: str = "INFO") -> None:
    """Configure application-wide logging."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
