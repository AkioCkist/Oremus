"""Turns each model's output into Oremus's shared categories. Kept free of torch so it can be unit tested alone."""

CATEGORIES = ("hate", "harassment", "sexual")


def from_vihate(probabilities: dict[str, float]) -> dict[str, float]:
    # ViHateT5 separates targeted hate from general offensive language.
    return {"hate": probabilities.get("HATE", 0.0), "harassment": probabilities.get("OFFENSIVE", 0.0) + probabilities.get("HATE", 0.0)}


def from_toxicity(toxic: float) -> dict[str, float]:
    # The multilingual model only knows "toxic", which is closest to harassment.
    return {"harassment": toxic}


def from_nsfw(probabilities: dict[str, float]) -> dict[str, float]:
    return {"sexual": probabilities.get("nsfw", 0.0)}


def merge_max(*results: dict[str, float]) -> dict[str, float]:
    merged: dict[str, float] = {}
    for result in results:
        for category, score in result.items():
            merged[category] = round(min(max(merged.get(category, 0.0), score), 1.0), 4)
    return merged
