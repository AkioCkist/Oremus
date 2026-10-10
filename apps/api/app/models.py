from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class FeedCandidate(BaseModel):
    post_id: str
    author_id: str
    created_at: datetime
    reaction_count: int = 0
    comment_count: int = 0
    is_following: bool = False
    is_group_member: bool = False


class RankFeedRequest(BaseModel):
    user_id: str
    candidates: list[FeedCandidate] = Field(max_length=250)
    limit: int = Field(default=20, ge=1, le=50)


class RankedPost(BaseModel):
    post_id: str
    score: float


class SearchItem(BaseModel):
    id: str
    kind: Literal["user", "post", "group"]
    title: str
    subtitle: str | None = None
    image_url: str | None = None
    url: str


class SearchResponse(BaseModel):
    query: str
    items: list[SearchItem]

