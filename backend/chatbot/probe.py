"""probe.py -- sanity-check the trained checkpoint by sampling from it."""
import json, os, sys
import torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import LSTMLM, PAD, UNK

HERE = os.path.dirname(os.path.abspath(__file__))
ck = torch.load(os.path.join(HERE, "model", "model.pt"), map_location="cpu",
                weights_only=False)
vocab = json.load(open(os.path.join(HERE, "corpus", "vocab.json"), encoding="utf-8"))
inv = {i: t for t, i in vocab.items()}

m = LSTMLM(ck["vocab_size"], ck["emb"], ck["hidden"])
m.load_state_dict(ck["state_dict"])
m.eval()

def gen(prompt, n=50, seed=1):
    ids = [vocab.get(t, UNK) for t in prompt.split()]
    out = m.sample(ids, max_new=n, seed=seed)
    return prompt + " " + " ".join(inv.get(i, "?") for i in out)

prompts = [
    "a <chamazon> <rat5>",          # open-ended review continuation
    "the texture and",              # mid-sentence
    "a <chnykaa> <rat1>",
]
print("=== free generation (review voice) ===")
for p in prompts:
    print("*", gen(p))
    print()

# the important test: does it know ads facts?
print("=== ads-fact recall ===")
qs = [
    "a Campaign Diwali Sale",
    "a What was the ROAS",
    "a Summarise the account",
    "a Which campaigns are losing money",
]
for q in qs:
    print("*", gen(q, n=60, seed=2))
    print()

# teacher-forced check: can it reproduce a known ads answer?
print("=== teacher-forced: known answer completion ===")
target = ("a Campaign Diwali Sale spent 12.0 lakh rupees and returned 30.0 lakh "
          "rupees, a ROAS of 2.50x.")
ids = [vocab.get(t, UNK) for t in target.split()]
x = torch.tensor([ids[:-1]], dtype=torch.long)
with torch.no_grad():
    logits, _ = m(x)
pred = logits[0].argmax(-1).tolist()
hits = sum(1 for a, b in zip(pred, ids[1:]) if a == b)
print("exact next-token accuracy: %d/%d = %.1f%%" % (hits, len(pred), 100.0*hits/len(pred)))
