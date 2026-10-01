"""
voice.py -- the trained-model half of the chatbot.

engine.py handles every number (it computes them from the CSV). This module
handles only phrasing and customer-voice colour: it loads the checkpoint
produced by train.py and generates text in the style of the 100k marketplace
reviews.

Division of labour, and why:

  numbers  -> engine.py   (computed from CSV, verifiable, never generated)
  tone     -> voice.py    (trained LSTM, used only for wording)

Measured quality of the checkpoint (see model/training_report.json):
  val loss 1.17, perplexity 3.2, 88.6% better than the unigram baseline.
  Teacher-forced next-token accuracy on a known ads answer was only ~31%,
  which is why this module is never allowed to emit a figure.

Anything numeric that comes out of the model is therefore never surfaced.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "model")
CHECKPOINT = os.path.join(MODEL_DIR, "model.pt")
VOCAB = os.path.join(HERE, "corpus", "vocab.json")

PAD, UNK = 0, 1

# A generated number would be a hallucination. The model is a style source, so
# any digit sequence it produces is stripped before the text reaches a user.
DIGIT_RUN = re.compile(r"\d[\d,.]*")


class ReviewVoice:
    def __init__(self):
        self.model = None
        self.vocab = None
        self.inv = None
        self.error = None
        self._load()

    def _load(self):
        if not os.path.isfile(CHECKPOINT):
            self.error = "checkpoint not found at %s" % CHECKPOINT
            return
        try:
            import torch
            from train import LSTMLM
        except Exception as exc:
            self.error = "torch/train import failed: %s" % exc
            return
        try:
            ck = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
            with open(VOCAB, encoding="utf-8") as f:
                self.vocab = json.load(f)
            self.inv = {i: t for t, i in self.vocab.items()}
            m = LSTMLM(ck["vocab_size"], ck["emb"], ck["hidden"])
            m.load_state_dict(ck["state_dict"])
            m.eval()
            self.model = m
        except Exception as exc:
            self.error = "load failed: %s" % exc

    @property
    def available(self):
        return self.model is not None

    def _generate(self, prompt_tokens, max_new=48, temperature=0.9, top_k=14, seed=0):
        import torch
        torch.manual_seed(seed)
        ids = [self.vocab.get(t, UNK) for t in prompt_tokens]
        if not ids:
            return ""
        out = []
        with torch.no_grad():
            for _ in range(max_new):
                inp = torch.tensor([ids[-1:]], dtype=torch.long)
                logits, _ = self.model(inp)
                logits = logits[0, -1] / max(temperature, 1e-3)
                if top_k:
                    v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                    logits[logits < v[-1]] = -float("inf")
                probs = torch.softmax(logits, dim=-1)
                nxt = int(torch.multinomial(probs, 1).item())
                if nxt == PAD:
                    break
                out.append(nxt)
                ids.append(nxt)
        return " ".join(self.inv.get(i, "") for i in out)

    # The corpus mixes review language with 800x-repeated ads Q/A lines, so
    # sampling occasionally drifts into campaign phrasing ("lakh rupees across
    # campaigns are losing money?"). Those fragments describe ads, not product
    # experience, and would be misleading under a "what customers say" label.
    ADS_DRIFT = re.compile(
        r"\b(campaign|roas|cpa|ctr|lakh|crore|revenue|spend|budget|adset|"
        r"objective|purchase|click|impression|account)\b", re.I)

    def _clean(self, text):
        # drop the structural tokens and the template filler the model learned
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"Review reference", " ", text)
        # strip every digit run: this module must never state a figure
        text = DIGIT_RUN.sub("", text)
        text = re.sub(r"\s+", " ", text).strip()
        text = re.sub(r"\s+([.,])", r"\1", text)
        # drop sentences that drifted into ads language
        kept = [s for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()
                and not self.ADS_DRIFT.search(s)]
        text = " ".join(kept).strip()
        # the template's filler clause adds nothing; drop it if present
        text = re.sub(r"I paid particular attention to the [a-z ]*\.?", "", text)
        return re.sub(r"\s{2,}", " ", text).strip()

    def comment(self, topic, channel=None, max_new=48, seed=0, tries=3):
        """
        Generate a short customer-voice comment about `topic`.

        channel is one of the corpus channel tokens (chamazon / chnykaa /
        chd2cweb) so the model can lean on the phrasing it saw for that
        marketplace.

        Sampling is tried a few times and the longest usable result is kept,
        because a single sample can collapse into template filler.
        """
        if not self.available:
            return None
        topic_tokens = re.sub(r"[^A-Za-z0-9 ]", " ", topic).split()[:10]
        ch = channel if channel in ("chamazon", "chnykaa", "chd2cweb") else "chamazon"
        prompt = [ch] + topic_tokens
        best = None
        for t in range(tries):
            try:
                cand = self._clean(self._generate(prompt, max_new=max_new, seed=seed + t))
            except Exception:
                return best
            if not cand:
                continue
            if best is None or len(cand) > len(best):
                best = cand
            if len(cand) > 60:
                break
        return best or None

    def status(self):
        return {
            "available": self.available,
            "error": self.error,
            "checkpoint": os.path.basename(CHECKPOINT) if os.path.isfile(CHECKPOINT) else None,
        }


_VOICE = None


def voice():
    global _VOICE
    if _VOICE is None:
        _VOICE = ReviewVoice()
        if not _VOICE.available:
            sys.stderr.write("[voice] unavailable: %s\n" % _VOICE.error)
    return _VOICE


# ---------------------------------------------------------------- routing
# Questions about product experience rather than ad performance. The numbers
# engine cannot answer these, so the trained model supplies the wording and the
# CSV supplies any figure that is quoted.
VOICE_TRIGGERS = re.compile(
    r"\b(review|customer|complain|feedback|texture|smell|fragrance|packaging|"
    r"consistency|oxidis|shade|undertone|pilling|sticky|breakout|skin|"
    r"hydration|sunscreen|spf|serum|what do (people|customers) (say|think))\b",
    re.I,
)

CAMPAIGN_WORDS = re.compile(
    r"\b(campaign|roas|cpa|ctr|spend|revenue|impression|click|purchase|budget|"
    r"adset|objective|anomal|decision|profit|loss)\b",
    re.I,
)


def wants_voice(question):
    """True when the question is about product experience, not ad metrics."""
    if CAMPAIGN_WORDS.search(question):
        return False
    return bool(VOICE_TRIGGERS.search(question))


if __name__ == "__main__":
    v = voice()
    print("status:", v.status())
    for topic in ["the texture", "the packaging", "this sunscreen", "the scent"]:
        print("-", topic, "->", v.comment(topic, seed=3))
