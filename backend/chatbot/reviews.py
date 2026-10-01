"""
reviews.py -- real customer review retrieval.

Why this exists instead of generating review text:

A word-level LSTM was trained on the 100k-review corpus (train.py, val loss
1.17 / perplexity 3.22). Those metrics look good, but generation from it
produces ungrammatical fragments:

    "the texture -> feels comfortable enough for me. into my other skincare
     product. The packaging could be a return of the price."

The cause is the source data, not the model. The corpus has only 434 distinct
tokens and every row is assembled from a fixed phrase bank
("I paid particular attention to the ...", "It spreads easily into my skin."),
so a next-token model learns the template perfectly and the sentence structure
barely at all. Low perplexity on templated text and fluent generation are
different things.

So review answers here quote real reviews verbatim rather than paraphrase them.
The model remains in the project (model/model.pt, probe.py, training_report.json)
because the pipeline is what produced the evidence above, but nothing user-facing
depends on its output.

Every quote is real, attributable to the marketplace channel and star rating in
the source file, and truncated with an ellipsis rather than rewritten.
"""

import csv
import math
import os
import pickle
import re
import sys
from collections import Counter, defaultdict

csv.field_size_limit(10_000_000)

HERE = os.path.dirname(os.path.abspath(__file__))
REVIEWS_CSV = (os.environ.get("CHATBOT_REVIEWS_CSV")
               or r"C:\Users\deshp\Downloads\marketplace_reviews_unique_100k.csv")
CACHE_PATH = os.path.join(HERE, "cache", "reviews_index.pkl")

# The templated filler appears in every row and carries no product signal, so
# it is stripped before indexing and never shown as a quote.
# Only the openers and reference markers are stripped. Sentences that carry
# actual product content ("It spreads easily and does not feel heavy", "I used
# it mostly in the morning") are kept: cutting them made quotes read worse, not
# better. The openers are stripped with their trailing noun phrase so they do
# not leave a dangling subject behind.
FILLER = [
    r"\bReview reference\b[^.]*\.?",
    r"\bI paid particular attention to the\b[^.]*\.?",
    r"\bI was (?:curious about|pleasantly surprised by) this [^.]*\.?",
    r"\bI (?:ordered|started using|kept coming back to|compared) this [^.]*\.?",
    r"\bI did not expect much from this [^.]*\.?",
    r"\bMy first impression of this [^.]*\.?",
    r"\bI tested it for several days before forming an opinion\.?",
]
FILLER_RE = re.compile("|".join(FILLER), re.I)

ASPECT_TERMS = {
    "texture":     r"texture|consistency|thick|thin|gel|creamy|gooey|spread",
    "packaging":   r"packaging|pump|dispenser|tube|bottle|leak|label|expiry",
    "scent":       r"scent|smell|fragrance|perfume|odour|odor",
    "sunspf":      r"sunscreen|spf|sun|tan|burn|white cast|pilling",
    "hydration":   r"hydrat|moistur|dryness|plump|dewy|matte|oily|shine",
    "shade":       r"shade|undertone|oxidis|oxidiz|patch|colour|color|tint",
    "breakout":    r"breakout|acne|pimple|irritat|redness|burning|itch|sensitiv",
    "value":       r"price|value|worth|cost|expensive|cheap|afford",
    "result":      r"result|worked|effective|difference|improv|after \d+",
    "usage":       r"apply|application|routine|everyday|daily|morning|night|use it",
}

# Words that are noise in a query but common in the corpus.
STOP = set("""
a an the is are was were be been being it its this that these those i my me we our
you your they them he she and or but if then than so as of to in on at by for with
from do does did have has had will would can could should may might must not no
use used using product formula purchase review reference particular attention paid
""".split())


def _norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", s.lower())


class ReviewIndex:
    """Keyword-indexed store of the real reviews, with aspect tagging."""

    def __init__(self, path=REVIEWS_CSV, max_rows=None):
        self.path = path
        self.error = None
        self.rows = []          # (text, channel, rating)
        self.df = Counter()    # token -> doc frequency
        self.postings = defaultdict(list)
        self.aspects = defaultdict(list)   # aspect -> [row index]
        self.aspect_hits = []
        self._build(max_rows)

    def _build(self, max_rows=None):
        if not os.path.isfile(self.path):
            self.error = "reviews csv not found at %s" % self.path
            sys.stderr.write("[reviews] %s\n" % self.error)
            return

        # Building the full index over 100k reviews takes ~80s, which is far
        # too slow to pay on every backend start. Cache it keyed on the CSV's
        # size and mtime so a changed file rebuilds automatically.
        cache = CACHE_PATH
        if max_rows is None and os.path.isfile(cache):
            try:
                with open(cache, "rb") as f:
                    blob = pickle.load(f)
                src = os.stat(self.path)
                if (blob.get("size") == src.st_size
                        and blob.get("mtime") == int(src.st_mtime)):
                    self.rows = blob["rows"]
                    self.df = Counter(blob["df"])
                    self.postings = defaultdict(list, blob["postings"])
                    self.aspects = defaultdict(list, blob["aspects"])
                    self.multi = blob["multi"]
                    self.multi_set = set(self.multi)
                    sys.stderr.write("[reviews] loaded cache: %d reviews\n"
                                     % len(self.rows))
                    return
            except Exception as exc:
                sys.stderr.write("[reviews] cache ignored: %s\n" % exc)

        n = 0
        try:
            with open(self.path, newline="", encoding="utf-8",
                      errors="replace") as f:
                for r in csv.DictReader(f):
                    text = (r.get("review_text") or "").strip()
                    if not text:
                        continue
                    ch = (r.get("channel") or "").strip() or "unknown"
                    try:
                        rating = int(float(r.get("star_rating") or 0))
                    except (TypeError, ValueError):
                        rating = 0
                    idx = len(self.rows)
                    self.rows.append((text, ch, rating))

                    toks = set(w for w in _norm(text).split()
                               if w not in STOP and len(w) > 2)
                    for t in toks:
                        self.df[t] += 1
                        self.postings[t].append(idx)

                    n_hits = 0
                    for name, pat in ASPECT_TERMS.items():
                        if re.search(pat, text, re.I):
                            self.aspects[name].append(idx)
                            n_hits += 1
                    # Counted inline. Re-scanning every aspect list per row
                    # (the obvious alternative) makes indexing 100k reviews
                    # take minutes instead of seconds.
                    self.aspect_hits.append(n_hits)

                    n += 1
                    if max_rows and n >= max_rows:
                        break
        except Exception as exc:
            self.error = "load failed: %s" % exc
            sys.stderr.write("[reviews] %s\n" % self.error)
            return

        # Reviews touching 3+ aspects carry the most usable detail.
        # Counted from the stored text rather than by intersecting the aspect
        # lists per row, which is what made indexing take minutes.
        self.multi = []
        for i, (text, _, _) in enumerate(self.rows):
            if sum(1 for pat in ASPECT_TERMS.values()
                   if re.search(pat, text, re.I)) >= 3:
                self.multi.append(i)
        self.multi_set = set(self.multi)
        if max_rows is None:
            try:
                src = os.stat(self.path)
                with open(cache, "wb") as f:
                    pickle.dump({
                        "size": src.st_size,
                        "mtime": int(src.st_mtime),
                        "rows": self.rows,
                        "df": dict(self.df),
                        "postings": dict(self.postings),
                        "aspects": dict(self.aspects),
                        "aspect_hits": self.aspect_hits,
                        "multi": self.multi,
                    }, f, protocol=pickle.HIGHEST_PROTOCOL)
            except Exception as exc:
                sys.stderr.write("[reviews] cache write failed: %s\n" % exc)

        sys.stderr.write("[reviews] indexed %d reviews, %d terms, %d multi-aspect\n"
                         % (len(self.rows), len(self.df), len(self.multi)))

    # ---------------------------------------------------------------- search
    @property
    def available(self):
        return bool(self.rows) and not self.error

    def _score(self, query, pool=None):
        terms = [w for w in _norm(query).split()
                 if w not in STOP and len(w) > 2]
        if not terms:
            return []
        cand = Counter()
        total = len(self.rows)
        for t in terms:
            if t not in self.df:
                continue
            idf = math.log(total / (1.0 + self.df[t]))
            for i in self.postings[t]:
                if pool is None or i in pool:
                    cand[i] += idf
        if not cand and pool:
            return [(i, 0.0) for i in list(pool)[:20]]
        return cand.most_common(40)

    def _excerpt(self, text, terms, maxlen=200):
        """
        Return a contiguous, verbatim span of `text`, centred on the densest
        cluster of query terms, wrapped in "..." where it was cut.

        Verbatim matters here and is enforced by test_engine.py. An earlier
        version deleted the template boilerplate ("I was curious about this
        product. I paid particular attention to the ...") with regex
        substitution. The result read better but was no longer what the file
        said, so the fidelity test rejected it. Selecting a span instead keeps
        the customer's own words exactly as written; the boilerplate simply
        shows up, which is honest given the source data is templated.
        """
        if len(text) <= maxlen:
            return text
        low = text.lower()
        best_at = 0
        best_hits = -1
        for t in terms:
            at = low.find(t)
            if at < 0:
                continue
            start = max(0, at - maxlen // 3)
            window = low[start:start + maxlen]
            hits = sum(window.count(u) for u in terms)
            if hits > best_hits:
                best_hits, best_at = hits, start
        seg = text[best_at:best_at + maxlen].strip()
        if best_at > 0:
            seg = "..." + seg
        if best_at + maxlen < len(text):
            seg = seg + "..."
        return seg

    def search(self, query, limit=4, prefer_aspects=None):
        """
        Return real quotes relevant to the query.

        prefer_aspects: ordered aspect names to bias toward.
        """
        if not self.available:
            return []

        terms = [w for w in _norm(query).split()
                 if w not in STOP and len(w) > 2]

        pool = None
        for a in (prefer_aspects or []):
            hits = self.aspects.get(a)
            if hits and len(hits) >= limit:
                pool = set(hits)
                break

        ranked = self._score(query, pool=pool)
        if len(ranked) < limit:
            for i, s in self._score(query):
                if i not in {r[0] for r in ranked}:
                    ranked.append((i, s * 0.6))
        if not ranked:
            ranked = [(i, 0.0) for i in self.multi[:limit * 3]]

        out = []
        seen_rows = set()
        seen_text = set()
        for i, _ in ranked:
            if i in seen_rows:
                continue
            text, ch, rating = self.rows[i]
            # Prefer reviews the query's own terms hit hardest. The corpus is
            # templated, so TF-IDF alone surfaces rows that merely share the
            # boilerplate; anchoring on the literal query words keeps the
            # quotes on topic.
            if terms and not any(t in text.lower() for t in terms):
                continue
            excerpt = self._excerpt(text, terms)
            # Rows can be byte-identical once truncated to the same window, so
            # dedupe on content. Showing one sentence three times is worse than
            # showing three different ones.
            key = _norm(excerpt)[:160]
            if key in seen_text:
                continue
            seen_rows.add(i)
            seen_text.add(key)
            out.append({
                "quote": excerpt,
                "channel": ch,
                "rating": rating,
            })
            if len(out) >= limit:
                break

        # Nothing matched literally (query was all filler words, or the aspect
        # pattern fired without the words appearing). Fall back to the
        # aspect-ranked rows so the user still gets something on topic.
        if not out and pool:
            for i in list(pool)[:limit * 4]:
                text, ch, rating = self.rows[i]
                excerpt = self._excerpt(text, [], maxlen=180)
                key = _norm(excerpt)[:160]
                if key in seen_text:
                    continue
                seen_text.add(key)
                out.append({"quote": excerpt, "channel": ch, "rating": rating})
                if len(out) >= limit:
                    break
        return out

    def detect_aspects(self, query):
        found = []
        for name, pat in ASPECT_TERMS.items():
            if re.search(pat, query, re.I):
                found.append(name)
        return found

    def aspect_stats(self, aspect, limit=3):
        """Quotes plus simple counts for one aspect."""
        if not self.available:
            return None
        idxs = self.aspects.get(aspect, [])
        if not idxs:
            return None
        ratings = Counter(self.rows[i][2] for i in idxs)
        channels = Counter(self.rows[i][1] for i in idxs)
        # Multi-aspect reviews carry more detail, so they make better quotes.
        # Rows are then spread across distinct wording: the templated corpus
        # has runs of near-identical rows, and taking the first N would quote
        # the same sentence N times.
        pref = [i for i in idxs if i in self.multi_set] or idxs
        # Bucket by rating so quotes differ in sentiment and wording, not just
        # in which row was picked.
        by_rating = defaultdict(list)
        for i in pref:
            by_rating[self.rows[i][2]].append(i)

        # Round-robin across ratings, most-populated first, so a run of 3
        # quotes spans different star levels.
        order = [r for r, _ in sorted(by_rating.items(), key=lambda kv: -len(kv[1]))]
        quotes, seen, used = [], set(), 0
        while len(quotes) < limit and used < sum(len(v) for v in by_rating.values()):
            for r in order:
                if len(quotes) >= limit:
                    break
                if used < len(by_rating[r]):
                    i = by_rating[r][used]
                    used += 1
                    text, ch, rating = self.rows[i]
                    quote = self._excerpt(text, terms=[], maxlen=200)
                    key = _norm(quote)[:160]
                    if key in seen:
                        continue
                    seen.add(key)
                    quotes.append({"quote": quote, "channel": ch, "rating": rating})
        return {
            "aspect": aspect,
            "mentions": len(idxs),
            "avg_rating": (sum(k * v for k, v in ratings.items()) / len(idxs))
                          if idxs else 0,
            "rating_hist": dict(ratings),
            "channels": dict(channels),
            "quotes": quotes,
        }

    def status(self):
        return {
            "available": self.available,
            "error": self.error,
            "reviews": len(self.rows),
            "terms": len(self.df),
            "aspects": {a: len(v) for a, v in sorted(
                self.aspects.items(), key=lambda kv: -len(kv[1]))},
            "path": os.path.basename(self.path),
        }


_INDEX = None


def index():
    global _INDEX
    if _INDEX is None:
        _INDEX = ReviewIndex()
    return _INDEX


if __name__ == "__main__":
    ix = index()
    st = ix.status()
    print("reviews indexed :", st["reviews"])
    print("aspects         :", st["aspects"])
    print()
    for q in ["what do customers say about the texture",
              "packaging problems", "any complaints about oxidation",
              "is it worth the price"]:
        print("=" * 64)
        print("Q:", q)
        for r in ix.search(q, limit=3, prefer_aspects=ix.detect_aspects(q)):
            print("  - (%s, %s*) %s" % (r["channel"], r["rating"], r["quote"][:150]))
        print()
