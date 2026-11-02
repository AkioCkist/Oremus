import re

# Letters that only occur in Vietnamese among the languages Oremus sees.
_VIETNAMESE_LETTERS = re.compile("[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]", re.IGNORECASE)
_TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)
# Common words and slang as typed without diacritics, which is how much abuse is written.
_UNACCENTED_WORDS = frozenset(
    "khong minh ban may tao la cua nguoi ngu qua nhu thi roi duoc nay do vay sao gi nhe nha ko k "
    "vcl vl dm dcm cmm clm dit lon cac oc cho deo dek bo me".split()
)


def route_language(text: str) -> str:
    """Pick which text model to run: "vi", "other", or "both" when it cannot be told apart.

    Diacritics are decisive. Without them a guess can be wrong in either direction, and a
    missed insult costs more than the extra inference, so uncertain text goes through both.
    """
    if _VIETNAMESE_LETTERS.search(text):
        return "vi"
    tokens = [token.lower() for token in _TOKEN.findall(text)]
    if not tokens:
        return "other"
    hits = sum(token in _UNACCENTED_WORDS for token in tokens)
    return "both" if hits and hits / len(tokens) >= 0.2 else "other"


def split_chunks(text: str, words_per_chunk: int = 180, max_chunks: int = 4) -> list[str]:
    """Long posts are scored in pieces so abuse cannot hide past the model's token limit."""
    words = text.split()
    chunks = [" ".join(words[start : start + words_per_chunk]) for start in range(0, len(words), words_per_chunk)]
    return chunks[:max_chunks]
