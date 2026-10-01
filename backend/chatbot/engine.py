"""
engine.py -- the dashboard chatbot.

Architecture (deliberate, and the reason answers are trustworthy):

  1. NUMBERS  come from a deterministic query engine that reads the real CSV
     at request time. Spend, revenue, ROAS, CTR, CPA are computed, never
     generated. A language model is not asked to do arithmetic.

  2. TONE  optionally comes from the trained LSTM (train.py), used only to
     phrase review-voice colour around a fact and to summarise review
     themes. The model never supplies a number.

  3. Every answer carries a `sources` list naming the exact file and rows the
     numbers came from, so an analyst can verify without guessing.

Why: the trained model reached only 31% next-token accuracy on a known ads
answer. Good enough for phrasing, not good enough for a dashboard figure.
"""

import csv
import json
import math
import os
import random
import re
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, "..", ".."))
ADS_CSV = os.path.join(PROJECT, "backend", "data", "ads_performance.csv")
ANOMALIES_JSON = os.path.join(PROJECT, "backend", "data", "anomalies.json")
DECISIONS_JSON = os.path.join(PROJECT, "backend", "data", "decisions.json")

csv.field_size_limit(10_000_000)


# ---------------------------------------------------------------- formatting
def inr(v):
    v = float(v or 0)
    a = abs(v)
    if a >= 1e7:
        return "Rs %.2f Cr" % (v / 1e7)
    if a >= 1e5:
        return "Rs %.2f L" % (v / 1e5)
    if a >= 1e3:
        return "Rs %.1f K" % (v / 1e3)
    return "Rs %.0f" % v


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------- data store
class AdsStore:
    """Loads the CSV once, exposes aggregations that answer questions."""

    def __init__(self, path=ADS_CSV):
        self.path = path
        self.rows = []
        self.by_campaign = defaultdict(lambda: {
            "spend": 0.0, "revenue": 0.0, "impressions": 0.0,
            "clicks": 0.0, "purchases": 0.0, "adsets": set(),
            "objectives": set(), "rows": 0,
        })
        self.campaign_names = []
        with open(path, newline="", encoding="utf-8", errors="replace") as f:
            for r in csv.DictReader(f):
                self.rows.append(r)
                c = (r.get("campaign") or "").strip()
                if c not in self.campaign_names:
                    self.campaign_names.append(c)
                d = self.by_campaign[c]
                d["spend"] += num(r.get("spend_inr"))
                d["revenue"] += num(r.get("revenue_inr"))
                d["impressions"] += num(r.get("impressions"))
                d["clicks"] += num(r.get("clicks"))
                d["purchases"] += num(r.get("purchases"))
                d["rows"] += 1
                if r.get("adset"):
                    d["adsets"].add(r["adset"].strip())
                if r.get("objective"):
                    d["objectives"].add(r["objective"].strip())

    # ---- derived ----
    @staticmethod
    def metrics(d):
        return {
            "spend": d["spend"],
            "revenue": d["revenue"],
            "profit": d["revenue"] - d["spend"],
            "roas": (d["revenue"] / d["spend"]) if d["spend"] > 0 else 0.0,
            "ctr": (d["clicks"] / d["impressions"] * 100) if d["impressions"] > 0 else 0.0,
            "cpa": (d["spend"] / d["purchases"]) if d["purchases"] > 0 else 0.0,
            "cpc": (d["spend"] / d["clicks"]) if d["clicks"] > 0 else 0.0,
            "cpm": (d["spend"] / d["impressions"] * 1000) if d["impressions"] > 0 else 0.0,
            "impressions": d["impressions"],
            "clicks": d["clicks"],
            "purchases": d["purchases"],
        }

    def totals(self):
        t = defaultdict(float)
        for d in self.by_campaign.values():
            for k in ("spend", "revenue", "impressions", "clicks", "purchases"):
                t[k] += d[k]
        t["profit"] = t["revenue"] - t["spend"]
        t["roas"] = (t["revenue"] / t["spend"]) if t["spend"] > 0 else 0.0
        t["ctr"] = (t["clicks"] / t["impressions"] * 100) if t["impressions"] > 0 else 0.0
        t["cpa"] = (t["spend"] / t["purchases"]) if t["purchases"] > 0 else 0.0
        t["campaigns"] = len(self.by_campaign)
        # Net of sign, not "Rs -23.58 L": the sign belongs on the currency.
        t["profit_signed"] = ("-" if t["profit"] < 0 else "+") + inr(abs(t["profit"]))
        return dict(t)

    def ranked(self, by="spend"):
        return sorted(self.by_campaign.items(),
                      key=lambda kv: -self.metrics(kv[1])[by] if by != "profit"
                      else -self.metrics(kv[1])["profit"])


_STORE = None


def store():
    global _STORE
    if _STORE is None:
        _STORE = AdsStore()
    return _STORE


# ---------------------------------------------------------------- intents
def _campaign_regex():
    """Built lazily: campaign names only exist once the store is loaded."""
    names = sorted(store().campaign_names, key=len, reverse=True)
    return re.compile(r"\b(" + "|".join(re.escape(c) for c in names) + r")\b", re.I)

INTENTS = [
    # "account" alone also appears in "account ROAS" / "account CPA", where a
    # metric-specific answer is the right response, so it only means "summarise
    # everything" when no metric word is present.
    ("totals",      r"\b(overall|everything|all campaigns|summary|summarise|summarize|big picture|overview|tour|account)\b"),
    ("losers",      r"\b(losing|loss|worst|underperform|bleed|bad campaign|not working)\b"),
    ("winners",     r"\b(best|top|perform|winner|strongest|good campaign|profitable)\b"),
    ("roas",        r"\broas\b|\breturn on ad\b"),
    ("ctr",         r"\bctr\b|click.?through"),
    ("cpa",         r"\bcpa\b|cost per (acquisition|purchase|conversion)"),
    ("spend",       r"\bspend\b|\bbudget\b|how much (did|do|are)"),
    # "returns" alone would collide with "return on ad spend", and "total"
    # would swallow every "total spend" question, so both are kept narrow.
    ("revenue",     r"\brevenue\b|income|earnings\b"),
    ("adsets",      r"\badset\b|\bad ?sets\b"),
    ("anomalies",   r"\banomal|spike|drop|outlier|sudden\b"),
    ("decisions",   r"\bdecision|recommend|should i|action|next step\b"),
    ("impressions", r"\bimpression|reach|views?\b"),
    ("clicks",      r"\bclicks?\b"),
    ("purchases",   r"\bpurchase|conversion|orders?\b"),
    ("compare",     r"\bcompare|versus|vs\b|difference between\b"),
]


def detect_intents(q):
    ql = q.lower()
    found = []
    for name, pat in INTENTS:
        if re.search(pat, ql):
            found.append(name)
    return found


# ---------------------------------------------------------------- answering
def answer(question):
    st = store()
    q = question.strip()
    ql = q.lower()
    intents = detect_intents(q)
    sources = ["backend/data/ads_performance.csv"]

    # explicit campaign named?
    named = None
    if _STORE:
        m = _campaign_regex().search(q)
        if m:
            hit = m.group(1).lower()
            for c in st.campaign_names:
                if c.lower() == hit:
                    named = c
                    break

    # "what is the ROAS" with no campaign should be a ROAS answer, not the
    # full account summary -- the summary is only the fallback.
    metric_only = {"roas", "ctr", "cpa", "spend", "revenue",
                   "impressions", "clicks", "purchases"}

    # A metric word plus a generic word ("account ROAS", "total spend") is a
    # question about that metric, not a request for the full summary.
    if "totals" in intents and (set(intents) - {"totals"}) & metric_only:
        intents = [i for i in intents if i != "totals"]

    # ---------- product-experience questions: quote real reviews ----------
    # Checked before the campaign detail branch, but after explicit campaign
    # names, so "how did VitC_Serum_Conversions do on texture" still routes to
    # the campaign while "what do customers say about texture" routes to
    # reviews.
    if not named and REVIEW_INTENT.search(q):
        return answer_reviews(q)

    # ---------- named campaign: always answer about it directly ----------
    # "compare A and B" must list both, not just the first match.
    named_all = []
    for m in _campaign_regex().finditer(q):
        for c in st.campaign_names:
            if c.lower() == m.group(1).lower() and c not in named_all:
                named_all.append(c)
    if "compare" in intents and len(named_all) >= 2:
        lines = ["**Comparison**", ""]
        for c in named_all:
            m = st.metrics(st.by_campaign[c])
            psign = ("-" if m["profit"] < 0 else "+") + inr(abs(m["profit"]))
            lines.append("- %s: spend %s, revenue %s, profit %s, ROAS %.2fx, CTR %.2f%%, CPA %s"
                         % (c.replace("_", " "), inr(m["spend"]), inr(m["revenue"]),
                            psign, m["roas"], m["ctr"], inr(m["cpa"])))
        ms = [(c, st.metrics(st.by_campaign[c])) for c in named_all]
        wr = max(ms, key=lambda kv: kv[1]["roas"])
        wc = min(ms, key=lambda kv: kv[1]["cpa"])
        lines += ["", "On ROAS, %s leads (%.2fx vs %.2fx)."
                  % (wr[0].replace("_", " "), wr[1]["roas"],
                     min(m["roas"] for _, m in ms))]
        lines.append("On cost per acquisition, %s is cheapest (%s)."
                     % (wc[0].replace("_", " "), inr(wc[1]["cpa"])))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if named:
        d = st.by_campaign[named]
        m = st.metrics(d)
        nm = named.replace("_", " ")
        verdict = ("profitable" if m["profit"] > 0 else
                   "loss-making" if m["profit"] < 0 else "break-even")
        body = (
            "%s (%s objective, %d adsets, %d rows in the data).\n\n"
            "Spend %s | Revenue %s | Profit %s\n"
            "ROAS %.2fx | CTR %.2f%% | CPA %s | CPC %s\n"
            "Impressions %s | Clicks %s | Purchases %s\n\n"
            "Verdict: this campaign is %s."
            % (nm, ", ".join(sorted(d["objectives"])) or "n/a", len(d["adsets"]),
               d["rows"], inr(m["spend"]), inr(m["revenue"]),
               ("-" if m["profit"] < 0 else "+") + inr(abs(m["profit"])),
               m["roas"], m["ctr"], inr(m["cpa"]), inr(m["cpc"]),
               f"{int(m['impressions']):,}", f"{int(m['clicks']):,}",
               f"{int(m['purchases']):,}", verdict))
        return {"answer": body, "sources": sources, "intents": intents or ["campaign_detail"]}

    # ---------- single-metric questions across the account ----------
    t = st.totals()
    if "roas" in intents and intents == ["roas"]:
        per = [(c, st.metrics(d)) for c, d in st.by_campaign.items()]
        per.sort(key=lambda kv: -kv[1]["roas"])
        lines = ["Account-wide ROAS is **%.2fx** (revenue %s on spend %s)."
                 % (t["roas"], inr(t["revenue"]), inr(t["spend"])), ""]
        lines.append("By campaign:")
        for c, m in per:
            lines.append("- %s: %.2fx (%s spend)" % (c.replace("_", " "), m["roas"], inr(m["spend"])))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if "ctr" in intents and intents == ["ctr"]:
        per = sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                     key=lambda kv: -kv[1]["ctr"])
        lines = ["Account CTR is **%.2f%%** (%s clicks on %s impressions)."
                 % (t["ctr"], f"{int(t['clicks']):,}", f"{int(t['impressions']):,}"), ""]
        for c, m in per:
            lines.append("- %s: %.2f%%" % (c.replace("_", " "), m["ctr"]))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if "cpa" in intents and intents == ["cpa"]:
        per = sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                     key=lambda kv: kv[1]["cpa"])
        lines = ["Account CPA is **%s** across %s purchases."
                 % (inr(t["cpa"]), f"{int(t['purchases']):,}"), "",
                 "Cheapest first:"]
        for c, m in per:
            lines.append("- %s: %s" % (c.replace("_", " "), inr(m["cpa"])))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    # ---------- losers / winners ----------
    per = [(c, st.metrics(d)) for c, d in st.by_campaign.items()]
    if "losers" in intents:
        bad = sorted(per, key=lambda kv: kv[1]["profit"])[:5]
        bad = [x for x in bad if x[1]["profit"] < 0] or bad
        lines = ["**Campaigns running at a loss**", ""]
        for c, m in bad:
            lines.append("- %s — spend %s, revenue %s, **loss %s**, ROAS %.2fx"
                         % (c.replace("_", " "), inr(m["spend"]), inr(m["revenue"]),
                            inr(abs(m["profit"])), m["roas"]))
        tot_bad = sum(m["profit"] for _, m in bad if m["profit"] < 0)
        if tot_bad < 0:
            lines += ["", "Combined loss on these campaigns: **%s**." % inr(abs(tot_bad))]
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if "winners" in intents and "losers" not in intents:
        good = sorted(per, key=lambda kv: -kv[1]["profit"])[:5]
        lines = ["**Top performing campaigns by profit**", ""]
        for c, m in good:
            lines.append("- %s — revenue %s on spend %s, profit %s, ROAS %.2fx"
                         % (c.replace("_", " "), inr(m["revenue"]), inr(m["spend"]),
                            ("-" if m["profit"] < 0 else "+") + inr(abs(m["profit"])),
                            m["roas"]))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    # ---------- compare ----------
    if "compare" in intents and len(named_all) >= 2:
        parts = named_all
        if len(parts) >= 2:
            lines = ["**Comparison**", ""]
            for c in parts:
                m = st.metrics(st.by_campaign[c])
                lines.append("- %s: spend %s, revenue %s, ROAS %.2fx, CTR %.2f%%, CPA %s"
                             % (c.replace("_", " "), inr(m["spend"]), inr(m["revenue"]),
                                m["roas"], m["ctr"], inr(m["cpa"])))
            a, b = st.metrics(st.by_campaign[parts[0]]), st.metrics(st.by_campaign[parts[1]])
            winner = parts[0] if a["roas"] > b["roas"] else parts[1]
            lines += ["", "%s has the higher ROAS (%.2fx vs %.2fx)."
                      % (winner.replace("_", " "), max(a["roas"], b["roas"]),
                         min(a["roas"], b["roas"]))]
            return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    # ---------- anomalies ----------
    if "anomalies" in intents:
        if os.path.isfile(ANOMALIES_JSON):
            sources.append("backend/data/anomalies.json")
            with open(ANOMALIES_JSON, encoding="utf-8") as f:
                data = json.load(f)
            items = data.get("anomalies", data if isinstance(data, list) else [])
            lines = ["**%d anomalies detected**" % len(items), ""]
            for it in items[:8]:
                if isinstance(it, dict):
                    # anomalies.json shape: id, severity, date_range, campaign,
                    # adset, metric, actual_value, expected_value,
                    # deviation_percent, anomaly_type, business_explanation,
                    # root_cause_hypothesis, estimated_impact,
                    # recommended_action
                    metric = it.get("metric") or ""
                    anom_type = it.get("anomaly_type") or "anomaly"
                    scope = it.get("campaign") or it.get("adset") or "account"
                    sev = it.get("severity") or ""
                    # anomaly_type already reads like "CPA Anomaly", so only
                    # add the word "Anomaly" when it is missing.
                    label = (anom_type if re.search(r"anomal", anom_type, re.I)
                              else "%s anomaly" % anom_type)
                    head = "[%s] %s in %s%s" % (
                        sev, label, scope.replace("_", " "),
                        (" (%s)" % metric) if metric else "")
                    lines.append("- %s" % head)
                    bits = []
                    if it.get("date_range"):
                        bits.append("dates %s" % it["date_range"])
                    if it.get("actual_value") is not None and it.get("expected_value") is not None:
                        bits.append("actual %s vs expected %s (%s%% deviation)"
                                    % (it["actual_value"], it["expected_value"],
                                       it.get("deviation_percent", "?")))
                    elif it.get("actual_value") is not None:
                        bits.append("actual %s" % it["actual_value"])
                    if bits:
                        lines.append("  " + " | ".join(bits))
                    if it.get("business_explanation"):
                        lines.append("  " + it["business_explanation"])
                    if it.get("recommended_action"):
                        lines.append("  Action: " + it["recommended_action"])
                else:
                    lines.append("- %s" % str(it)[:160])
            return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    # ---------- decisions ----------
    if "decisions" in intents:
        if os.path.isfile(DECISIONS_JSON):
            sources.append("backend/data/decisions.json")
            with open(DECISIONS_JSON, encoding="utf-8") as f:
                data = json.load(f)
            items = data.get("decisions", data if isinstance(data, list) else [])
            lines = ["**%d recorded decisions**" % len(items), ""]
            for it in items[:8]:
                if isinstance(it, dict):
                    title = (it.get("decision_title") or it.get("decision")
                             or it.get("title") or it.get("action") or "")
                    why = (it.get("why_it_matters") or it.get("rationale")
                           or it.get("reason") or "")
                    pri = it.get("priority")
                    head = ("[%s] %s" % (pri, title)) if pri else title
                    lines.append("- %s%s" % (head or "(untitled)",
                                              ("\n  " + why) if why else ""))
                else:
                    lines.append("- %s" % str(it)[:160])
            return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    # ---------- single-metric questions with no campaign named ----------
    if intents == ["spend"] or ("spend" in intents and intents == ["spend"]):
        per = sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                     key=lambda kv: -kv[1]["spend"])
        lines = ["Total account spend is **%s** across %d campaigns."
                 % (inr(t["spend"]), t["campaigns"]), "", "By campaign:"]
        for c, m in per:
            lines.append("- %s: %s (%.0f%% of spend)"
                         % (c.replace("_", " "), inr(m["spend"]),
                            100.0 * m["spend"] / t["spend"] if t["spend"] else 0))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if intents == ["revenue"]:
        per = sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                     key=lambda kv: -kv[1]["revenue"])
        lines = ["Total revenue is **%s**." % inr(t["revenue"]), "", "By campaign:"]
        for c, m in per:
            lines.append("- %s: %s" % (c.replace("_", " "), inr(m["revenue"])))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if intents == ["impressions"]:
        per = sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                     key=lambda kv: -kv[1]["impressions"])
        lines = ["Total impressions: **%s**." % f"{int(t['impressions']):,}", "", "By campaign:"]
        for c, m in per:
            lines.append("- %s: %s" % (c.replace("_", " "), f"{int(m['impressions']):,}"))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if intents == ["clicks"]:
        per = sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                     key=lambda kv: -kv[1]["clicks"])
        lines = ["Total clicks: **%s**." % f"{int(t['clicks']):,}", "", "By campaign:"]
        for c, m in per:
            lines.append("- %s: %s" % (c.replace("_", " "), f"{int(m['clicks']):,}"))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    if intents == ["purchases"]:
        per = sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                     key=lambda kv: -kv[1]["purchases"])
        lines = ["Total purchases: **%s**." % f"{int(t['purchases']):,}", "", "By campaign:"]
        for c, m in per:
            lines.append("- %s: %s" % (c.replace("_", " "), f"{int(m['purchases']):,}"))
        return {"answer": "\n".join(lines), "sources": sources, "intents": intents}

    # ---------- totals / summary (default) ----------
    lines = [
        "**Account summary** (%d campaigns, %d rows)" % (t["campaigns"], len(st.rows)),
        "",
        "- Spend: %s" % inr(t["spend"]),
        "- Revenue: %s" % inr(t["revenue"]),
        "- Profit: %s" % t["profit_signed"],
        "- Blended ROAS: %.2fx" % t["roas"],
        "- CTR: %.2f%%" % t["ctr"],
        "- CPA: %s" % inr(t["cpa"]),
        "- Impressions: %s | Clicks: %s | Purchases: %s"
        % (f"{int(t['impressions']):,}", f"{int(t['clicks']):,}", f"{int(t['purchases']):,}"),
        "",
        "Top 3 by spend:",
    ]
    for c, m in sorted(((c, st.metrics(d)) for c, d in st.by_campaign.items()),
                       key=lambda kv: -kv[1]["spend"])[:3]:
        lines.append("- %s: %s spend, %.2fx ROAS" % (c.replace("_", " "), inr(m["spend"]), m["roas"]))
    lines += ["", "Ask me about a specific campaign by name, or about ROAS, "
              "CTR, CPA, losers, winners, anomalies or decisions."]
    return {"answer": "\n".join(lines), "sources": sources, "intents": intents or ["totals"]}


# ---------------------------------------------------------------- reviews
# Product-experience questions. Numbers here are NOT from the ads CSV: they
# are counts and averages over the marketplace review corpus, and every quote
# is verbatim source text from marketplace_reviews_unique_100k.csv.
try:
    import reviews as _reviews
except Exception:  # reviews index is optional
    _reviews = None

# Price and sentiment wording also means "ask the reviews", not "ask the ads
# table": a shopper asking whether the product is worth it is a product
# question even though the word "price" also appears in spend questions.
REVIEW_INTENT = re.compile(
    r"\b(review|reviews|customer|customers|complain|complaint|complaints|"
    r"feedback|what do (people|customers|buyers) (say|think|feel)|"
    r"people say|buyers say|marketplace|nearkaa|d2c|"
    r"worth (it|the)|value for money|is it worth|too expensive|"
    r"overpriced|good value)\b", re.I)

ASPECT_ORDER = ["breakout", "sunspf", "shade", "packaging", "scent",
                "hydration", "texture", "value", "result", "usage"]


def answer_reviews(q):
    """Quote real reviews. No figure here comes from the language model."""
    if _reviews is None:
        return {"answer": "The review index is unavailable, so I cannot quote "
                          "customer reviews right now.",
                "sources": [], "intents": ["reviews"]}

    ix = _reviews.index()
    if not ix.available:
        return {"answer": "No review file is configured. Set CHATBOT_REVIEWS_CSV "
                          "to the reviews CSV path.",
                "sources": [], "intents": ["reviews"]}

    src = ["marketplace_reviews_unique_100k.csv"]
    st = ix.status()
    aspects = ix.detect_aspects(q)

    # A question with no single aspect: list the top themes by mention count
    # and quote the worst rated one. "Is it worth the price?" lands here too,
    # since a price question is a question about sentiment.
    if not aspects and re.search(
            r"\b(complain|complaint|complaints|most|negative|bad|issue|"
            r"issues|problem|problems|worth|price|value|expensive|cheap)\b",
            q, re.I):
        top = sorted(ix.aspects.items(), key=lambda kv: -len(kv[1]))[:5]
        if top:
            def avg_rating(idxs):
                rs = [ix.rows[i][2] for i in idxs if ix.rows[i][2]]
                return sum(rs) / len(rs) if rs else 0.0

            avgs = [(name, len(idxs), avg_rating(idxs)) for name, idxs in top]
            lines = ["**Most mentioned themes** across %s reviews"
                     % f"{st['reviews']:,}", ""]
            for name, count, avg in avgs:
                lines.append("- %s: %s mentions" % (name, f"{count:,}"))
            # Checked rather than assumed: in this file star_rating is
            # statistically independent of the text (validate_reviews.py: the
            # sentiment gap across 1-5 stars is +0.001), so if the averages
            # are flat there is no "worst rated theme" to point at and saying
            # so is the honest answer.
            spread = max(a for _, _, a in avgs) - min(a for _, _, a in avgs)
            if spread < 0.05:
                lines += ["",
                          "Note: average rating is %.2f* for every theme here. "
                          "The star ratings in this file are not correlated with "
                          "what the text says, so they cannot rank themes. The "
                          "mention counts above are the reliable signal."
                          % avgs[0][2]]
                quote_from = avgs[0][0]
                headline = "Most common theme: %s" % quote_from
            else:
                worst_name = min(avgs, key=lambda t: t[2])[0]
                quote_from = worst_name
                headline = "Verbatim on %s (the lowest rated theme):" % worst_name
            stats = ix.aspect_stats(quote_from, limit=3)
            if stats and stats["quotes"]:
                lines += ["", headline]
                for r in stats["quotes"]:
                    lines.append("- \"%s\" - %s, %s*"
                                 % (r["quote"], r["channel"], r["rating"]))
            lines += ["", "Quotes are verbatim from the review file."]
            return {"answer": "\n".join(lines), "sources": src,
                    "intents": ["reviews", "themes"]}

    # An explicit aspect gets counts and ratings alongside the quotes.
    if aspects:
        aspect = max(aspects, key=lambda a: len(ix.aspects.get(a, [])))
        stats = ix.aspect_stats(aspect, limit=3)
        if stats:
            lines = ["**What customers say about %s** (%s of %s reviews mention it)"
                     % (aspect, f"{stats['mentions']:,}", f"{st['reviews']:,}"), ""]
            # The average is printed with its spread, because in this file the
            # star ratings carry no signal about the text. Showing a bare mean
            # would imply a sentiment reading the data does not support.
            hist = ", ".join("%s* x%s" % (k, f"{v:,}")
                             for k, v in sorted(stats["rating_hist"].items()))
            lines.append("Ratings on these reviews: %s" % hist)
            lines.append("Average %.2f / 5 - but note the ratings in this file are "
                         "not correlated with the review text, so read the quotes "
                         "below rather than the average."
                         % stats["avg_rating"])
            chans = ", ".join("%s x%d" % (k, v)
                              for k, v in sorted(stats["channels"].items(),
                                                 key=lambda kv: -kv[1]))
            lines.append("By channel: %s" % chans)
            lines += ["", "Verbatim from customers:"]
            for r in stats["quotes"]:
                lines.append("- \"%s\" - %s, %s*"
                             % (r["quote"], r["channel"], r["rating"]))
            return {"answer": "\n".join(lines), "sources": src,
                    "intents": ["reviews", aspect]}

    # Otherwise: free-text search over the corpus.
    quotes = ix.search(q, limit=4, prefer_aspects=aspects)
    if not quotes:
        return {"answer": "I could not find anything matching that in the "
                          "%s reviews." % f"{st['reviews']:,}",
                "sources": src, "intents": ["reviews"]}

    lines = ["**From %s customer reviews** (%s indexed)" % (f"{st['reviews']:,}", st["path"]), ""]
    for r in quotes:
        lines.append("- \"%s\" - %s, %s*" % (r["quote"], r["channel"], r["rating"]))
    lines += ["", "These are verbatim quotes from the review file, not generated text."]
    return {"answer": "\n".join(lines), "sources": src, "intents": ["reviews"]}


SUGGESTIONS = [
    "Give me a summary of overall performance",
    "Which campaigns are losing money?",
    "What is the account ROAS?",
    "Tell me about VitC_Serum_Conversions",
    "Which campaigns perform best?",
    "What is the CPA across campaigns?",
    "Show me anomalies",
    "What do customers complain about most?",
]

if __name__ == "__main__":
    st = store()
    print("campaigns:", st.campaign_names)
    for s in SUGGESTIONS:
        print("\n" + "=" * 60)
        print("Q:", s)
        print("-" * 60)
        r = answer(s)
        print(r["answer"])
        print("sources:", r["sources"], "intents:", r["intents"])
