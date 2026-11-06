import re

# Letters that only occur in Vietnamese among the languages Oremus sees.
_VIETNAMESE_LETTERS = re.compile("[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]", re.IGNORECASE)
_TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)
# Common words and slang as typed without diacritics, which is how much abuse is written.
_UNACCENTED_WORDS = frozenset(
    "khong minh ban may tao la cua nguoi ngu qua nhu thi roi duoc nay do vay sao gi nhe nha ko k "
    "vcl vl dm dcm cmm clm dit lon cac oc cho deo dek bo me giet chet dam".split()
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


_LEET = str.maketrans("013457@$", "oieastas")
# One letter (or look-alike digit) at a time, split by spaces or punctuation: "t a o g i 3 t m a y".
_SPACED_RUN = re.compile(r"(?<![^\W_])[^\W\d_](?:[\s.\-_*]+[^\W_](?![^\W_])){2,}", re.UNICODE)
_SEPARATOR = re.compile(r"[\s.\-_*]+")
# An unaccented Vietnamese syllable: optional initial consonant, a vowel cluster, optional final consonant.
_SYLLABLE = re.compile(r"(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx])?[aeiouy]{1,3}(?:ng|nh|ch|[cmnpt])?")
_MAX_SYLLABLE = 7


def _syllables(word: str) -> list[str] | None:
    """Split letters into the fewest Vietnamese syllables, or None when they do not spell Vietnamese."""
    best: list[list[str] | None] = [[]] + [None] * len(word)
    for end in range(1, len(word) + 1):
        for start in range(max(0, end - _MAX_SYLLABLE), end):
            previous = best[start]
            if previous is not None and _SYLLABLE.fullmatch(word, start, end):
                candidate = previous + [word[start:end]]
                if best[end] is None or len(candidate) < len(best[end]):
                    best[end] = candidate
    return best[-1]


def _join_run(match: re.Match) -> str:
    letters = _SEPARATOR.sub("", match.group()).lower().translate(_LEET)
    syllables = _syllables(letters) if letters.isascii() else None
    return " ".join(syllables) if syllables else letters


def deobfuscate(text: str) -> str:
    """Undo letter-by-letter spelling, which hides abuse from models trained on normal words.

    "t a o g i e t m a y" becomes "tao giet may". Runs that are not Vietnamese are simply joined ("k i l l" to "kill").
    """
    return _SPACED_RUN.sub(_join_run, text)
