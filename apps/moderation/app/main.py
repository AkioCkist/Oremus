import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("moderation")
SECRET = os.environ.get("MODERATION_SECRET", "")
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class State:
    engines = None
    error: str | None = None


state = State()
# Inference already uses every thread it is given; running requests side by side only slows them all down.
inference_lock = asyncio.Lock()


def _load() -> None:
    from .engines import Engines

    state.engines = Engines()


async def _load_in_background() -> None:
    try:
        await asyncio.to_thread(_load)
        logger.info("Moderation models are ready")
    except Exception as error:  # noqa: BLE001 - surfaced on /health instead of crash-looping the download
        state.error = str(error)
        logger.exception("Moderation models failed to load")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # The first boot downloads several gigabytes, so the server comes up first and reports "loading" meanwhile.
    task = asyncio.create_task(_load_in_background())
    yield
    task.cancel()


app = FastAPI(title="Oremus Moderation", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def require_secret(x_moderation_secret: str = Header(default="")) -> None:
    if not SECRET or not hmac.compare_digest(x_moderation_secret, SECRET):
        raise HTTPException(status_code=401, detail="Invalid moderation secret")


def ready_engines():
    if state.engines is None:
        raise HTTPException(status_code=503, detail="Models are still loading")
    return state.engines


class TextInput(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


@app.get("/health")
async def health() -> dict:
    status = "ready" if state.engines else "failed" if state.error else "loading"
    return {"status": status, "error": state.error}


@app.post("/v1/text", dependencies=[Depends(require_secret)])
async def score_text(payload: TextInput) -> dict:
    engines = ready_engines()
    async with inference_lock:
        return await asyncio.to_thread(engines.score_text, payload.text)


@app.post("/v1/image", dependencies=[Depends(require_secret)])
async def score_image(request: Request) -> dict:
    engines = ready_engines()
    data = await request.body()
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is empty or too large")
    async with inference_lock:
        try:
            return await asyncio.to_thread(engines.score_image, data)
        except OSError as error:
            raise HTTPException(status_code=422, detail="Not a readable image") from error
