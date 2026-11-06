from app.language import deobfuscate, route_language, split_chunks
from app.scoring import from_vihate, merge_max


def test_diacritics_mean_vietnamese():
    assert route_language("Hôm nay trời đẹp quá") == "vi"


def test_unaccented_slang_runs_both_models():
    assert route_language("may ngu vcl") == "both"


def test_plain_english_uses_the_multilingual_model():
    assert route_language("what a lovely day at the beach with friends") == "other"


def test_a_stray_common_word_does_not_force_both_models():
    assert route_language("This is a long english sentence about la la land and other films") == "other"


def test_text_without_letters_is_not_vietnamese():
    assert route_language("12345 !!!") == "other"


def test_chunks_are_capped():
    chunks = split_chunks("word " * 1000, words_per_chunk=100, max_chunks=3)
    assert len(chunks) == 3
    assert all(len(chunk.split()) == 100 for chunk in chunks)


def test_hate_also_counts_as_harassment():
    scores = from_vihate({"CLEAN": 0.1, "OFFENSIVE": 0.2, "HATE": 0.7})
    assert scores["hate"] == 0.7
    assert abs(scores["harassment"] - 0.9) < 1e-9


def test_merge_keeps_the_worst_score_per_category():
    assert merge_max({"hate": 0.2, "harassment": 0.9}, {"hate": 0.5}) == {"hate": 0.5, "harassment": 0.9}


def test_spaced_out_vietnamese_is_rejoined_into_syllables():
    assert deobfuscate("t a o g i e t m a y") == "tao giet may"
    assert deobfuscate("tao g.i.3.t m-a-y") == "tao giet may"
    assert route_language(deobfuscate("t a o g i e t m a y")) == "both"


def test_spaced_out_english_is_joined():
    assert deobfuscate("k i l l yourself") == "kill yourself"


def test_normal_text_is_left_alone():
    for text in ("Lãi suất ngân hàng tháng này tăng nhẹ", "I am a cat", "đi ăn đi", "A B testing"):
        assert deobfuscate(text) == text
