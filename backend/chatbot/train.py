#!/usr/bin/env python3
"""
train.py -- CPU-only language model for the dashboard chatbot.

Model: single-layer LSTM over a word-level vocabulary, trained with next-token
prediction on the corpus built by build_corpus.py.

Deliberately small so it trains in minutes on CPU:
    vocab 432  x  emb 128  x  hidden 256  ~= 0.45M parameters

Why an LSTM and not a pretrained transformer:
    - No GPU here, and CPU fine-tuning of GPT-2 small on 100k rows takes hours
    - The source vocabulary is tiny (432 distinct tokens), so a large model
      would be wasted capacity
    - A word-level LSTM on a 432-token vocab reaches low loss very quickly

Usage:
    python train.py                  # default: ~8 epochs
    python train.py --epochs 12
    python train.py --max-minutes 10 # wall-clock cap
"""

import argparse
import json
import os
import time

import torch
import torch.nn as nn
import torch.optim as optim

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "corpus")
OUT = os.path.join(HERE, "model")

PAD, UNK = 0, 1


def log(m):
    print("[train] %s" % m, flush=True)


def load_split(name, vocab, seq_len):
    ids = []
    with open(os.path.join(CORPUS, name), encoding="utf-8") as f:
        for line in f:
            toks = line.strip().split()
            if len(toks) < 2:
                continue
            ids.append([vocab.get(t, UNK) for t in toks])
    return make_windows(ids, seq_len)


def make_windows(rows, seq_len):
    """Concatenate lines, then chop into (x, y) pairs offset by one token."""
    xs, ys = [], []
    for r in rows:
        for i in range(len(r) - 1):
            xs.append(r[i])
            ys.append(r[i + 1])
    # pad into a tensor of fixed width
    n = len(xs)
    x = torch.full((n, seq_len), PAD, dtype=torch.long)
    y = torch.full((n, seq_len), PAD, dtype=torch.long)
    for i in range(n):
        x[i, 0] = xs[i]
        y[i, 0] = ys[i]
    return x, y


class LSTMLM(nn.Module):
    def __init__(self, vocab_size, emb=128, hidden=256, layers=1, dropout=0.2):
        super().__init__()
        self.emb = nn.Embedding(vocab_size, emb, padding_idx=PAD)
        self.lstm = nn.LSTM(emb, hidden, num_layers=layers, batch_first=True,
                            dropout=dropout if layers > 1 else 0.0)
        self.drop = nn.Dropout(dropout)
        self.out = nn.Linear(hidden, vocab_size)

    def forward(self, x, state=None):
        e = self.drop(self.emb(x))
        out, state = self.lstm(e, state)
        return self.out(self.drop(out)), state

    def sample(self, prompt_ids, max_new=60, temperature=0.85, top_k=12, seed=None):
        """Greedy-with-sampling decode from a prompt."""
        if seed is not None:
            torch.manual_seed(seed)
        self.eval()
        ids = list(prompt_ids)
        out_ids = []
        with torch.no_grad():
            for _ in range(max_new):
                inp = torch.tensor([ids[-1:]], dtype=torch.long)
                logits, _ = self.forward(inp)
                logits = logits[0, -1] / max(temperature, 1e-3)
                if top_k:
                    v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                    logits[logits < v[-1]] = -float("inf")
                probs = torch.softmax(logits, dim=-1)
                nxt = int(torch.multinomial(probs, 1).item())
                if nxt == PAD:
                    break
                out_ids.append(nxt)
                ids.append(nxt)
        return out_ids


def evaluate(model, x, y, batch=128, limit=4000):
    model.eval()
    ce = nn.CrossEntropyLoss(ignore_index=PAD)
    n = min(limit, x.size(0))
    total, count = 0.0, 0
    with torch.no_grad():
        for i in range(0, n, batch):
            xb, yb = x[i:i + batch], y[i:i + batch]
            logits, _ = model(xb)
            loss = ce(logits.view(-1, logits.size(-1)), yb.view(-1))
            total += loss.item() * xb.size(0)
            count += xb.size(0)
    return total / max(count, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--seq-len", type=int, default=8)
    ap.add_argument("--emb", type=int, default=128)
    ap.add_argument("--hidden", type=int, default=256)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--max-minutes", type=float, default=25.0)
    ap.add_argument("--train-limit", type=int, default=60000)
    args = ap.parse_args()

    torch.manual_seed(1234)
    os.makedirs(OUT, exist_ok=True)

    with open(os.path.join(CORPUS, "vocab.json"), encoding="utf-8") as f:
        vocab = json.load(f)
    inv = {i: t for t, i in vocab.items()}
    log("vocab size %d" % len(vocab))

    xtr, ytr = load_split("train.txt", vocab, args.seq_len)
    xva, yva = load_split("val.txt", vocab, args.seq_len)
    if xtr.size(0) > args.train_limit:
        xtr, ytr = xtr[:args.train_limit], ytr[:args.train_limit]
    log("train windows %d | val windows %d" % (xtr.size(0), xva.size(0)))

    model = LSTMLM(len(vocab), args.emb, args.hidden)
    nparams = sum(p.numel() for p in model.parameters())
    log("parameters %.2fM" % (nparams / 1e6))

    opt = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    sched = optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    ce = nn.CrossEntropyLoss(ignore_index=PAD)

    n = xtr.size(0)
    steps = (n // args.batch) * args.epochs
    warm = max(1, steps // 20)
    step = 0
    t0 = time.time()
    deadline = t0 + args.max_minutes * 60
    best_val = float("inf")
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        perm = torch.randperm(n)
        run, seen = 0.0, 0
        for i in range(0, n - args.batch + 1, args.batch):
            idx = perm[i:i + args.batch]
            xb, yb = xtr[idx], ytr[idx]
            logits, _ = model(xb)
            loss = ce(logits.view(-1, logits.size(-1)), yb.view(-1))
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            if step < warm:
                for gp in opt.param_groups:
                    gp["lr"] = args.lr * (step + 1) / warm
            else:
                sched.step()
            step += 1
            run += loss.item()
            seen += 1
            if seen % 40 == 0:
                el = (time.time() - t0) / 60
                log("ep %d  loss %.4f  ppl %.1f  lr %.2e  %.1f min"
                    % (epoch, run / seen, pow(2.718281828, run / seen),
                       opt.param_groups[0]["lr"], el))
            if time.time() > deadline:
                log("wall-clock cap reached, stopping early")
                break

        train_loss = run / max(seen, 1)
        val_loss = evaluate(model, xva, yva)
        history.append({"epoch": epoch, "train_loss": train_loss,
                        "val_loss": val_loss, "val_ppl": pow(2.718281828, val_loss)})
        log("EPOCH %d  train %.4f  val %.4f  val_ppl %.1f"
            % (epoch, train_loss, val_loss, pow(2.718281828, val_loss)))

        if val_loss < best_val:
            best_val = val_loss
            torch.save({
                "state_dict": model.state_dict(),
                "vocab_size": len(vocab),
                "emb": args.emb,
                "hidden": args.hidden,
                "seq_len": args.seq_len,
            }, os.path.join(OUT, "model.pt"))
            log("saved checkpoint (val %.4f)" % val_loss)

        if time.time() > deadline:
            break

    # perplexity sanity: what does a unigram baseline get?
    counts = torch.zeros(len(vocab))
    for t in ytr.view(-1):
        if int(t) != PAD:
            counts[int(t)] += 1
    p = (counts + 1) / (counts.sum() + len(vocab))
    uni = float(-torch.log(p[yva.view(-1)]).mean())
    log("unigram baseline val loss %.4f (ppl %.1f)" % (uni, pow(2.718281828, uni)))
    log("model best val loss %.4f (ppl %.1f)" % (best_val, pow(2.718281828, best_val)))
    log("model beats unigram by %.1f%%"
        % (100.0 * (uni - best_val) / uni if uni else 0.0))

    with open(os.path.join(OUT, "training_report.json"), "w", encoding="utf-8") as f:
        json.dump({
            "history": history,
            "best_val_loss": best_val,
            "best_val_ppl": pow(2.718281828, best_val),
            "unigram_val_loss": uni,
            "params": nparams,
            "vocab_size": len(vocab),
            "epochs_run": len(history),
            "minutes": (time.time() - t0) / 60,
        }, f, indent=2)

    log("done in %.1f min -> %s" % ((time.time() - t0) / 60, OUT))


if __name__ == "__main__":
    main()
