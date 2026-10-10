from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_env_file() -> Path | str:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / ".env"
        if candidate.exists():
            return candidate
    return ".env"


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017/oremus"
    redis_url: str = "redis://localhost:6379"
    feed_cache_ttl: int = 45
    search_cache_ttl: int = 30

    model_config = SettingsConfigDict(env_file=find_env_file(), extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()

