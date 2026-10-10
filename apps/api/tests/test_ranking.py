from datetime import UTC, datetime, timedelta
from app.models import FeedCandidate
from app.services import rank_candidates


def test_followed_author_is_prioritized() -> None:
    now = datetime.now(UTC)
    ranked = rank_candidates([
        FeedCandidate(post_id="public", author_id="a", created_at=now, reaction_count=2),
        FeedCandidate(post_id="followed", author_id="b", created_at=now - timedelta(hours=2), is_following=True),
    ])
    assert ranked[0].post_id == "followed"


def test_ranking_is_descending() -> None:
    now = datetime.now(UTC)
    ranked = rank_candidates([
        FeedCandidate(post_id="old", author_id="a", created_at=now - timedelta(days=4)),
        FeedCandidate(post_id="new", author_id="b", created_at=now),
    ])
    assert ranked == sorted(ranked, key=lambda item: item.score, reverse=True)
