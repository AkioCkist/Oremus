import hashlib
import json
import math
import re
from datetime import UTC, datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from .models import FeedCandidate, RankedPost, SearchItem


def rank_candidates(candidates: list[FeedCandidate]) -> list[RankedPost]:
    """Transparent ranking: relationships dominate, engagement adds a capped boost."""
    now = datetime.now(UTC)
    ranked: list[RankedPost] = []
    for item in candidates:
        created = item.created_at if item.created_at.tzinfo else item.created_at.replace(tzinfo=UTC)
        age_hours = max((now - created).total_seconds() / 3600, 0)
        freshness = 8 / (1 + age_hours / 18)
        relationship = (6 if item.is_following else 0) + (3 if item.is_group_member else 0)
        engagement = min(math.log1p(item.reaction_count * 2 + item.comment_count * 3), 5)
        ranked.append(RankedPost(post_id=item.post_id, score=round(freshness + relationship + engagement, 4)))
    return sorted(ranked, key=lambda post: post.score, reverse=True)


def _safe_object_id(value: str) -> ObjectId | None:
    return ObjectId(value) if ObjectId.is_valid(value) else None


async def search(db: AsyncIOMotorDatabase, redis: Redis, query: str, limit: int) -> list[SearchItem]:
    normalized = " ".join(query.lower().split())[:80]
    cache_key = f"search:{hashlib.sha256(normalized.encode()).hexdigest()}:{limit}"
    if cached := await redis.get(cache_key):
        return [SearchItem.model_validate(item) for item in json.loads(cached)]

    pattern = {"$regex": re.escape(normalized), "$options": "i"}
    per_kind = max(limit // 3, 1)
    users = await db.users.find(
        {"$or": [{"username": pattern}, {"displayName": pattern}], "deletedAt": None},
        {"username": 1, "displayName": 1, "profile.bio": 1, "profile.avatarUrl": 1},
    ).limit(per_kind).to_list(per_kind)
    posts = await db.posts.find(
        {"content": pattern, "deletedAt": None, "visibility": "public", "groupId": None},
        {"content": 1, "authorId": 1},
    ).sort("createdAt", -1).limit(per_kind).to_list(per_kind)
    groups = await db.groups.find(
        {"$or": [{"name": pattern}, {"description": pattern}]},
        {"name": 1, "description": 1, "coverUrl": 1},
    ).limit(per_kind).to_list(per_kind)

    items = [
        SearchItem(id=str(u["_id"]), kind="user", title=u.get("displayName", u.get("username", "User")), subtitle=f"@{u.get('username', '')}", image_url=u.get("profile", {}).get("avatarUrl"), url=f"/profile/{u.get('username', '')}")
        for u in users
    ]
    items += [SearchItem(id=str(p["_id"]), kind="post", title=p.get("content", "")[:90], subtitle="Post", url=f"/posts/{p['_id']}") for p in posts]
    items += [SearchItem(id=str(g["_id"]), kind="group", title=g.get("name", "Group"), subtitle=g.get("description", "")[:100], image_url=g.get("coverUrl"), url=f"/groups/{g.get('slug', '')}") for g in groups]
    await redis.setex(cache_key, 30, json.dumps([item.model_dump() for item in items]))
    return items[:limit]

