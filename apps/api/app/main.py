from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis

from .config import get_settings
from .models import RankFeedRequest, RankedPost, SearchResponse
from .services import rank_candidates, search

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo = AsyncIOMotorClient(settings.mongodb_uri)
    app.state.mongo = mongo
    app.state.db = mongo.get_default_database()
    app.state.redis = Redis.from_url(settings.redis_url, decode_responses=True)
    yield
    mongo.close()
    await app.state.redis.aclose()


app = FastAPI(
    title="Oremus Ranking and Search API",
    version="1.0.0",
    description="Meaningful service boundary for personalized ranking and cross-entity search.",
    lifespan=lifespan,
)


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    await request.app.state.db.command("ping")
    await request.app.state.redis.ping()
    return {"status": "ok"}


@app.post("/v1/feed/rank", response_model=list[RankedPost])
async def rank_feed(payload: RankFeedRequest) -> list[RankedPost]:
    return rank_candidates(payload.candidates)[: payload.limit]


@app.get("/v1/search", response_model=SearchResponse)
async def search_all(
    request: Request,
    q: str = Query(min_length=2, max_length=80),
    limit: int = Query(default=18, ge=1, le=50),
) -> SearchResponse:
    try:
        items = await search(request.app.state.db, request.app.state.redis, q, limit)
        return SearchResponse(query=q, items=items)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Search is temporarily unavailable") from exc

