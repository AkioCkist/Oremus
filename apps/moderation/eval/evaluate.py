"""Scores the labelled Vietnamese samples against a running moderation service.

Run this after changing a model or a threshold, and before setting MODERATION_MODE=enforce:

    MODERATION_SECRET=... python eval/evaluate.py [http://localhost:8010]

It reports precision and recall per category and threshold. The bar for letting a category remove content
without a person is precision >= 0.9 at its block threshold. Below that, keep autoRemove off for that category.
"""
import csv
import json
import os
import pathlib
import sys
import time
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
SECRET = os.environ.get("MODERATION_SECRET", "")
SAMPLES = pathlib.Path(__file__).with_name("vi_samples.tsv")
# Which sample labels count as a true positive for each category.
POSITIVES = {"hate": {"hate"}, "harassment": {"hate", "offensive"}}
THRESHOLDS = (0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.97, 0.99)


def score(text: str) -> dict:
    request = urllib.request.Request(
        f"{URL}/v1/text",
        data=json.dumps({"text": text}).encode(),
        headers={"content-type": "application/json", "x-moderation-secret": SECRET},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def table(rows: list[dict], category: str) -> None:
    positives = POSITIVES[category]
    print(f"\n{category}: threshold  precision  recall  flagged  false-positives")
    for threshold in THRESHOLDS:
        flagged = [row for row in rows if row["scores"].get(category, 0) >= threshold]
        true_positive = sum(row["label"] in positives for row in flagged)
        total_positive = sum(row["label"] in positives for row in rows)
        precision = true_positive / len(flagged) if flagged else 1.0
        recall = true_positive / total_positive if total_positive else 0.0
        print(f"  {threshold:>18.2f}  {precision:>9.3f}  {recall:>6.3f}  {len(flagged):>7}  {len(flagged) - true_positive:>15}")


def main() -> None:
    with SAMPLES.open(encoding="utf-8", newline="") as file:
        samples = list(csv.DictReader(file, delimiter="\t"))
    rows = []
    started = time.perf_counter()
    for sample in samples:
        rows.append({**sample, "scores": score(sample["text"])["categories"]})
    elapsed = time.perf_counter() - started
    print(f"{len(rows)} samples, {elapsed / len(rows) * 1000:.0f} ms each")
    for category in POSITIVES:
        table(rows, category)
    wrong = [row for row in rows if row["label"] == "clean" and max(row["scores"].values(), default=0) >= 0.6]
    print(f"\nClean samples scoring >= 0.6 ({len(wrong)}):")
    for row in wrong:
        print(f"  {row['scores']}  {row['text']}")
    missed = [row for row in rows if row["label"] != "clean" and max(row["scores"].values(), default=0) < 0.6]
    print(f"\nHarmful samples scoring < 0.6 ({len(missed)}):")
    for row in missed:
        print(f"  [{row['label']}] {row['scores']}  {row['text']}")


if __name__ == "__main__":
    main()
