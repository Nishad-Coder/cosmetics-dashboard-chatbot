#!/usr/bin/env python3
"""
build_corpus.py -- assemble the training corpus for the dashboard chatbot.

Two sources are merged into one text corpus:

  1. Marketplace reviews  (marketplace_reviews_unique_100k.csv)
     All columns are used:
       - review_text   -> the body of the corpus (the thing being learned)
       - channel       -> a conditioning token, so the model can learn that
                          Amazon / Nykaa / D2C_Website feedback differs
       - date          -> year-month token, so the model has temporal context
       - star_rating   -> the model is told the rating up front, but see
                          NOTE below.
     NOTE ON star_rating: validated with validate_reviews.py, this column is
     statistically independent of the text (sentiment gap across 1..5 stars
     = +0.001). It is INCLUDED because it was explicitly requested, but it
     carries no learnable signal, so it must not be used as a training target.

  2. Ads performance records (backend/data/ads_performance.csv)
     Rendered into natural-language sentences, in two directions:
       - summary   : "Campaign X spent INR 12.0L and returned INR 30.0L
                     for a ROAS of 2.5x over 40 clicks."
       - question   : "How did Campaign X perform?"  (so the model sees the
                      ask as well as the answer)
     This is what gives the model the ability to talk about campaigns, spend,
     revenue, ROAS, CTR and CPA at all -- none of that exists in reviews.

Outputs (into ./corpus/):
  train.txt / val.txt / test.txt   one training sequence per line
  vocab.json                        token <-> id mapping
  meta.json                         corpus statistics
"""

import csv
import json
import os
import random
import re
import sys
from collections import Counter

csv.field_size_limit(10_000_000)

REVIEWS_CSV = r"C:\Users\deshp\Downloads\marketplace_reviews_unique_100k.csv"
ADS_CSV = None  # resolved relative to this script's project root, set below

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, "..", ".."))
ADS_CSV = os.path.join(PROJECT, "backend", "data", "ads_performance.csv")
OUT_DIR = os.path.join(HERE, "corpus")

SEED = 1234
VAL_FRAC = 0.02
TEST_FRAC = 0.02

# Channel / objective vocabularies are normalised so the model sees a small,
# consistent token set rather than thousands of one-off strings.
CAMPAIGN_VOCAB_SIZE = 400


def log(msg):
    print("[corpus] %s" % msg, flush=True)


def month_token(date_str):
    """'2026-06-16' -> 'y2026m06'"""
    m = re.match(r"(\d{4})-(\d{2})", date_str.strip())
    return "y%sm%s" % (m.group(1), m.group(2)) if m else "yUNKmUNK"


def channel_token(ch):
    c = ch.strip().lower()
    return {
        "amazon": "chamazon",
        "nykaa": "chnykaa",
        "d2c_website": "chd2cweb",
    }.get(c, "chother")


def rating_token(r):
    r = r.strip()
    return "rat%s" % r if r in {"1", "2", "3", "4", "5"} else "ratUNK"


def load_reviews(path, max_rows=None):
    """Yield cleaned review lines with all columns folded in as tokens."""
    n = 0
    skipped = 0
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            text = (row.get("review_text") or "").strip()
            if not text:
                skipped += 1
                continue
            # Collapse whitespace, drop the template's leading capital noise.
            text = re.sub(r"\s+", " ", text)
            prefix = "<%s> <%s> <%s>" % (
                channel_token(row.get("channel", "")),
                month_token(row.get("date", "")),
                rating_token(row.get("star_rating", "")),
            )
            yield "%s %s" % (prefix, text)
            n += 1
            if max_rows and n >= max_rows:
                break
    log("reviews: %d lines (%d skipped for empty text)" % (n, skipped))


# ---------------------------------------------------------------- ads side
def inr(v):
    """Render rupees the way the dashboard does."""
    v = float(v)
    if v >= 1e7:
        return "%.1f crore" % (v / 1e7)
    if v >= 1e5:
        return "%.1f lakh" % (v / 1e5)
    if v >= 1e3:
        return "%.1f thousand" % (v / 1e3)
    return "%.0f" % v


def collect_ads_vocab(path):
    """
    Every proper noun in the ads data, in the exact surface form the corpus
    uses, so the pruner can be told to keep them. Returns a set of tokens.
    """
    names = set()
    if not os.path.isfile(path):
        return names
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            for field in ("campaign", "objective", "adset"):
                v = (row.get(field) or "").strip()
                if not v:
                    continue
                # corpus renders "VitC_Serum_Conversions" as
                # "VitC Serum Conversions" (underscores -> spaces)
                for part in v.replace("_", " ").split():
                    names.add(part)
                names.add(v.replace("_", " "))
    return names


def load_ads(path):
    """
    Aggregate raw rows per campaign, then emit paired question/answer lines.
    The top-N campaigns by spend get their own lines; the long tail is covered
    by a single portfolio-level summary so we do not blow up corpus size.
    """
    if not os.path.isfile(path):
        log("ads csv not found at %s -- skipping ads section" % path)
        return []

    per = {}
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            key = (row.get("campaign", "").strip(), row.get("objective", "").strip())
            a = per.setdefault(key, {
                "spend": 0.0, "revenue": 0.0, "impr": 0.0,
                "clicks": 0.0, "purch": 0.0, "adsets": set(), "dates": [],
            })
            a["spend"] += float(row.get("spend_inr", 0) or 0)
            a["revenue"] += float(row.get("revenue_inr", 0) or 0)
            a["impr"] += float(row.get("impressions", 0) or 0)
            a["clicks"] += float(row.get("clicks", 0) or 0)
            a["purch"] += float(row.get("purchases", 0) or 0)
            if row.get("adset"):
                a["adsets"].add(row["adset"].strip())
            if row.get("date"):
                a["dates"].append(row["date"].strip())

    log("ads: %d campaign/objective groups" % len(per))

    ranked = sorted(per.items(), key=lambda kv: -kv[1]["spend"])
    head = ranked[:CAMPAIGN_VOCAB_SIZE]

    lines = []

    def metrics(a):
        roas = (a["revenue"] / a["spend"]) if a["spend"] > 0 else 0.0
        ctr = (a["clicks"] / a["impr"] * 100) if a["impr"] > 0 else 0.0
        cpa = (a["spend"] / a["purch"]) if a["purch"] > 0 else 0.0
        cpc = (a["spend"] / a["clicks"]) if a["clicks"] > 0 else 0.0
        return roas, ctr, cpa, cpc

    # 1) per-campaign ask/answer pairs, several phrasings for robustness
    for (campaign, objective), a in head:
        roas, ctr, cpa, cpc = metrics(a)
        profit = a["revenue"] - a["spend"]
        verdict = ("profitable" if profit > 0 else
                   "loss making" if profit < 0 else "break even")
        nm = campaign.replace("_", " ")

        answers = [
            "Campaign %s spent %s rupees and returned %s rupees, a ROAS of %.2fx. "
            "It earned %d clicks from %s impressions, a CTR of %.2f%%, at a cost per "
            "acquisition of %s rupees. With %d purchases it is %s."
            % (nm, inr(a["spend"]), inr(a["revenue"]), roas, a["clicks"],
               f"{int(a['impr']):,}", ctr, inr(cpa), int(a["purch"]), verdict),
            "For %s the spend was %s rupees and the revenue was %s rupees. "
            "That is a return of %.2fx on ad spend, and the campaign is %s."
            % (nm, inr(a["spend"]), inr(a["revenue"]), roas, verdict),
            "%s ran %s adsets under the %s objective. Total spend %s rupees, "
            "revenue %s rupees, ROAS %.2fx, CPA %s rupees."
            % (nm, len(a["adsets"]), objective, inr(a["spend"]),
               inr(a["revenue"]), roas, inr(cpa)),
        ]
        questions = [
            "How did the %s campaign perform?" % nm,
            "What was the ROAS on %s?" % nm,
            "Tell me about %s." % nm,
            "How much did %s spend and what did it earn?" % nm,
        ]
        for q in questions:
            lines.append("q %s" % q)
        for a_ in answers:
            lines.append("a %s" % a_)

    # 2) portfolio-level roll-ups
    tot_spend = sum(a["spend"] for _, a in ranked)
    tot_rev = sum(a["revenue"] for _, a in ranked)
    tot_impr = sum(a["impr"] for _, a in ranked)
    tot_clicks = sum(a["clicks"] for _, a in ranked)
    tot_purch = sum(a["purch"] for _, a in ranked)
    portfolio_roas = (tot_rev / tot_spend) if tot_spend else 0.0
    portfolio_ctr = (tot_clicks / tot_impr * 100) if tot_impr else 0.0
    portfolio_cpa = (tot_spend / tot_purch) if tot_purch else 0.0

    winners = [(c, a) for (c, _), a in ranked if a["revenue"] > a["spend"]][:5]
    losers = [(c, a) for (c, _), a in ranked if a["revenue"] < a["spend"]][:5]

    # best/worst are ((campaign, objective), agg) tuples
    (best_key, best_agg) = max(ranked, key=lambda kv: kv[1]["revenue"] - kv[1]["spend"])
    (worst_key, worst_agg) = min(ranked, key=lambda kv: kv[1]["revenue"] - kv[1]["spend"])

    summaries = [
        ("What is the overall ad performance?",
         "Across %d campaigns the total spend was %s rupees and total revenue "
         "was %s rupees. Blended ROAS is %.2fx, CTR is %.2f%%, and average cost "
         "per acquisition is %s rupees."
         % (len(ranked), inr(tot_spend), inr(tot_rev), portfolio_roas,
            portfolio_ctr, inr(portfolio_cpa))),
        ("Which campaigns are performing the best?",
         "The strongest campaign by profit is %s, with %s rupees of revenue "
         "against %s rupees of spend."
         % (best_key[0].replace("_", " "), inr(best_agg["revenue"]),
            inr(best_agg["spend"]))),
        ("Which campaigns are losing money?",
         "The worst performer is %s, spending %s rupees and bringing in only "
         "%s rupees, so it is running at a loss."
         % (worst_key[0].replace("_", " "), inr(worst_agg["spend"]),
            inr(worst_agg["revenue"]))),
        ("Summarise the account.",
         "The account spent %s rupees across %d campaigns and generated %s "
         "rupees in revenue, a blended ROAS of %.2fx. There are %d campaigns "
         "in profit and %d that are not."
         % (inr(tot_spend), len(ranked), inr(tot_rev), portfolio_roas,
            len(winners) + sum(1 for _, a in ranked if a["revenue"] > a["spend"]) - len(winners),
            len(losers) + sum(1 for _, a in ranked if a["revenue"] <= a["spend"]) - len(losers))),
    ]
    for q, a_ in summaries:
        lines.append("q %s" % q)
        lines.append("a %s" % a_)

    log("ads: %d lines emitted" % len(lines))
    return lines


def main():
    random.seed(SEED)
    os.makedirs(OUT_DIR, exist_ok=True)

    review_lines = list(load_reviews(REVIEWS_CSV))
    ads_lines = load_ads(ADS_CSV)

    # The ads corpus is small next to reviews, so it is repeated to a
    # meaningful share. At 8x the ratio was ~8000:1 and the model learned to
    # ignore campaign facts entirely (verified: 25% next-token accuracy on a
    # known ads answer). 800x brings it to ~80:1, which is enough for the
    # campaign numbers to actually stick while reviews still dominate tone.
    ads_repeat = 800
    all_lines = review_lines + ads_lines * ads_repeat
    random.shuffle(all_lines)

    n = len(all_lines)
    n_val = max(1, int(n * VAL_FRAC))
    n_test = max(1, int(n * TEST_FRAC))

    splits = {
        "test.txt": all_lines[:n_test],
        "val.txt": all_lines[n_test:n_test + n_val],
        "train.txt": all_lines[n_test + n_val:],
    }
    for fname, rows in splits.items():
        with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8") as f:
            for r in rows:
                f.write(r + "\n")

    # vocabulary from train only -- no leakage
    cnt = Counter()
    for line in splits["train.txt"]:
        cnt.update(line.split())

    # Tokens that must survive pruning no matter how rare they are, because
    # dropping them makes the model unable to answer questions about them:
    #   - structural markers (<chamazon>, <rat5>, q, a)
    #   - every campaign / objective / adset proper noun from the ads data
    #   - metric words used in ads answers (roas, ctr, cpa, clicks, ...)
    structural = {t for t in cnt if t.startswith("<") or t.startswith("rat") or t in ("q", "a")}
    # Metric words are matched case-insensitively, because the corpus writes them
    # both ways ("a ROAS of 2.50x" and "the roas on X"), and an exact-match set
    # silently dropped the lowercase forms.
    metric_words_ci = {
        "campaign", "campaigns", "roas", "ctr", "cpa", "clicks", "impressions",
        "revenue", "spend", "spends", "spent", "purchases", "adsets", "adset",
        "objective", "overall", "account", "performance", "profit", "loss",
        "losing", "money", "best", "worst", "strongest", "performer",
        "performing", "rupees", "lakh", "crore", "thousand", "blended",
        "average", "total", "return", "earned", "earn", "ran", "under",
        "vs", "x",
    }
    metric_words = {t for t in cnt if t.lower() in metric_words_ci}
    ads_vocab = collect_ads_vocab(ADS_CSV)
    keep_always = structural | (metric_words & set(cnt)) | (ads_vocab & set(cnt))
    log("protected tokens: %d structural/metric + %d ads proper nouns"
        % (len(structural | (metric_words & set(cnt))), len(ads_vocab & set(cnt))))

    vocab = {"<pad>": 0, "<unk>": 1}
    for tok, c in cnt.most_common():
        if c < 3 and tok not in keep_always:
            continue
        if tok not in vocab:
            vocab[tok] = len(vocab)
    with open(os.path.join(OUT_DIR, "vocab.json"), "w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False)

    words = sum(len(l.split()) for l in all_lines)
    meta = {
        "total_lines": n,
        "train_lines": len(splits["train.txt"]),
        "val_lines": len(splits["val.txt"]),
        "test_lines": len(splits["test.txt"]),
        "review_lines": len(review_lines),
        "ads_lines_unique": len(ads_lines),
        "ads_repeat": ads_repeat,
        "vocab_size": len(vocab),
        "total_words": words,
        "seed": SEED,
        "note": ("star_rating is included as a conditioning token per request, "
                 "but it is statistically independent of review_text in the "
                 "source data (sentiment gap across 1-5 stars = +0.001), so it "
                 "is not usable as a supervision target."),
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    log("total lines   : %d" % n)
    log("  train/val/test: %d / %d / %d"
        % (len(splits["train.txt"]), len(splits["val.txt"]), len(splits["test.txt"])))
    log("vocab size    : %d" % len(vocab))
    log("total words   : %s" % f"{words:,}")
    log("written to    : %s" % OUT_DIR)


if __name__ == "__main__":
    main()
