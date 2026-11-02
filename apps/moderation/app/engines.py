import io
import os

import torch
from PIL import Image
from transformers import (
    AutoImageProcessor,
    AutoModelForImageClassification,
    AutoModelForSeq2SeqLM,
    AutoModelForSequenceClassification,
    AutoTokenizer,
)

from .language import route_language, split_chunks
from .scoring import from_nsfw, from_toxicity, from_vihate, merge_max

# Pinned so a model can only change with a deliberate code change (and a new evaluation run).
VIHATE = ("tarudesu/ViHateT5-base-HSD", "671c4df933025e000ce0a22c078dc4f67ce95f8e")
TOXICITY = ("unitary/multilingual-toxic-xlm-roberta", "4ad6f5c104d9ce813a1a2f33cac0c5b579ef6ee5")
NSFW = ("Falconsai/nsfw_image_detection", "96cb0d0342c7afb80cab76ecc58b265fa44da256")

VIHATE_LABELS = ("CLEAN", "OFFENSIVE", "HATE")
MAX_TOKENS = 256


def model_version(pair: tuple[str, str]) -> str:
    return f"{pair[0]}@{pair[1][:8]}"


class Engines:
    """Every model, loaded once. Calls must be serialized by the caller: inference uses all granted threads."""

    def __init__(self) -> None:
        torch.set_num_threads(int(os.environ.get("MODERATION_THREADS", "2")))
        self.vihate_tokenizer = AutoTokenizer.from_pretrained(VIHATE[0], revision=VIHATE[1])
        self.vihate = AutoModelForSeq2SeqLM.from_pretrained(VIHATE[0], revision=VIHATE[1]).eval()
        self.vihate_labels = self.vihate_tokenizer(list(VIHATE_LABELS), return_tensors="pt", padding=True).input_ids
        self.toxicity_tokenizer = AutoTokenizer.from_pretrained(TOXICITY[0], revision=TOXICITY[1])
        self.toxicity = AutoModelForSequenceClassification.from_pretrained(TOXICITY[0], revision=TOXICITY[1]).eval()
        self.nsfw_processor = AutoImageProcessor.from_pretrained(NSFW[0], revision=NSFW[1])
        self.nsfw = AutoModelForImageClassification.from_pretrained(NSFW[0], revision=NSFW[1]).eval()

    @torch.inference_mode()
    def _vihate_chunk(self, text: str) -> dict[str, float]:
        """Probability of each label: the model is generative, so each label's likelihood is scored directly."""
        encoded = self.vihate_tokenizer(f"hate-speech-detection: {text}", return_tensors="pt", truncation=True, max_length=MAX_TOKENS)
        count = len(VIHATE_LABELS)
        labels = self.vihate_labels.clone()
        labels[labels == self.vihate_tokenizer.pad_token_id] = -100
        logits = self.vihate(
            input_ids=encoded.input_ids.repeat(count, 1),
            attention_mask=encoded.attention_mask.repeat(count, 1),
            labels=labels,
        ).logits
        losses = torch.nn.functional.cross_entropy(logits.transpose(1, 2), labels, ignore_index=-100, reduction="none").sum(dim=1)
        probabilities = torch.softmax(-losses, dim=0).tolist()
        return dict(zip(VIHATE_LABELS, probabilities))

    @torch.inference_mode()
    def _toxicity_chunk(self, text: str) -> float:
        encoded = self.toxicity_tokenizer(text, return_tensors="pt", truncation=True, max_length=MAX_TOKENS)
        logits = self.toxicity(**encoded).logits[0]
        return torch.sigmoid(logits[0]).item()

    def score_text(self, text: str) -> dict:
        route = route_language(text)
        chunks = split_chunks(text) or [""]
        results: list[dict[str, float]] = []
        models: list[str] = []
        if route in ("vi", "both"):
            results += [from_vihate(self._vihate_chunk(chunk)) for chunk in chunks]
            models.append(model_version(VIHATE))
        if route in ("other", "both"):
            results += [from_toxicity(self._toxicity_chunk(chunk)) for chunk in chunks]
            models.append(model_version(TOXICITY))
        return {"categories": merge_max(*results), "language": route, "models": models}

    @torch.inference_mode()
    def score_image(self, data: bytes) -> dict:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        logits = self.nsfw(**self.nsfw_processor(images=image, return_tensors="pt")).logits[0]
        probabilities = torch.softmax(logits, dim=0).tolist()
        labels = {self.nsfw.config.id2label[index]: value for index, value in enumerate(probabilities)}
        return {"categories": merge_max(from_nsfw(labels)), "models": [model_version(NSFW)]}
