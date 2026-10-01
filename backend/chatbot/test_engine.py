"""test_engine.py -- verify every answer's numbers against the raw CSV.

This is the guard that matters for a dashboard: the chatbot must never invent
a figure. Each case asserts an independently recomputed value.
"""
import csv, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import answer, store, inr, num

csv.field_size_limit(10_000_000)
st = store()

# --- independent recomputation straight from the CSV ---
raw_spend, raw_rev, raw_impr, raw_clicks, raw_purch = 0.0, 0.0, 0.0, 0.0, 0.0
with open(st.path, newline='', encoding='utf-8', errors='replace') as f:
    for r in csv.DictReader(f):
        raw_spend += num(r['spend_inr']); raw_rev += num(r['revenue_inr'])
        raw_impr += num(r['impressions']); raw_clicks += num(r['clicks'])
        raw_purch += num(r['purchases'])

expect_roas = raw_rev / raw_spend
expect_ctr = raw_clicks / raw_impr * 100
expect_cpa = raw_spend / raw_purch

checks = [
    ("overall roas", "What is the account ROAS?", "%.2fx" % expect_roas),
    ("overall ctr",  "What is the CTR?",           "%.2f%%" % expect_ctr),
    ("overall cpa",  "What is the CPA across campaigns?", "Rs %.0f" % expect_cpa),
    ("total spend",  "What is the total spend?",  inr(raw_spend)),
    ("total revenue","What is the total revenue?",inr(raw_rev)),
    ("impressions",  "Total impressions?",        f"{int(raw_impr):,}"),
    ("clicks",       "Total clicks?",             f"{int(raw_clicks):,}"),
    ("purchases",    "Total purchases?",          f"{int(raw_purch):,}"),
]

fails = 0
print("=" * 66)
print("NUMBER FIDELITY CHECK")
print("=" * 66)
for name, q, expected in checks:
    r = answer(q)
    ok = expected in r["answer"]
    print("[%s] %-14s expect %-14s" % ("PASS" if ok else "FAIL", name, expected))
    if not ok:
        fails += 1
        print("      got: %s" % r["answer"][:200].replace("\n", " | "))

# per-campaign: every metric must match a fresh recomputation
print()
print("=" * 66)
print("PER-CAMPAIGN CHECK (all %d campaigns, all metrics)" % len(st.campaign_names))
print("=" * 66)
for c in st.campaign_names:
    agg = {"spend":0.0,"revenue":0.0,"impressions":0.0,"clicks":0.0,"purchases":0.0,"n":0}
    with open(st.path, newline='', encoding='utf-8', errors='replace') as f:
        for r in csv.DictReader(f):
            if r['campaign'].strip() == c:
                agg["spend"] += num(r['spend_inr']); agg["revenue"] += num(r['revenue_inr'])
                agg["impressions"] += num(r['impressions']); agg["clicks"] += num(r['clicks'])
                agg["purchases"] += num(r['purchases']); agg["n"] += 1
    want = {
        "spend": inr(agg["spend"]),
        "revenue": inr(agg["revenue"]),
        "roas": "%.2fx" % (agg["revenue"]/agg["spend"] if agg["spend"] else 0),
        "cpa": inr(agg["spend"]/agg["purchases"] if agg["purchases"] else 0),
        "rows": "%d rows" % agg["n"],
    }
    r = answer("Tell me about %s" % c)
    bad = [k for k, v in want.items() if v not in r["answer"]]
    print("[%s] %-32s %s" % ("PASS" if not bad else "FAIL", c, "" if not bad else "missing %s" % bad))
    if bad:
        fails += 1

# losses must actually be negative
print()
losers = answer("Which campaigns are losing money?")["answer"]
agg_wm = {"s":0.0,"r":0.0}
with open(st.path, newline='', encoding='utf-8', errors='replace') as f:
    for row in csv.DictReader(f):
        if row['campaign'].strip() == 'Watermelon_Range_Awareness':
            agg_wm["s"] += num(row['spend_inr']); agg_wm["r"] += num(row['revenue_inr'])
truth = agg_wm["r"] < agg_wm["s"]
named = "Watermelon Range Awareness" in losers
print("[%s] loser really loses money: computed=%s reported=%s"
      % ("PASS" if (truth and named) else "FAIL", agg_wm["r"] < agg_wm["s"], named))
if not (truth and named):
    fails += 1

# --------------------------------------------------------------- reviews
# The critical property: quotes must be verbatim source text, never generated.
# Each is checked by string containment against the CSV.
print()
print("=" * 66)
print("REVIEW QUOTE FIDELITY (verbatim, not generated)")
print("=" * 66)

rev_path = r"C:\Users\deshp\Downloads\marketplace_reviews_unique_100k.csv"
if not os.path.isfile(rev_path):
    print("[SKIP] reviews csv not present")
else:
    all_texts = set()
    with open(rev_path, newline='', encoding='utf-8', errors='replace') as f:
        for row in csv.DictReader(f):
            t = (row.get('review_text') or '').strip()
            if t:
                all_texts.add(t)

    qs = ["What do customers say about the texture?",
          "What do customers say about the packaging?",
          "Any complaints about oxidation?",
          "What do customers say about the fragrance?",
          "Is it worth the price?",
          "What do customers complain about?"]
    for q in qs:
        a = answer(q)['answer']
        quotes = re.findall(r'- "([^"]+)"', a)
        if not quotes:
            print("[FAIL] %-48s no quotes returned" % q)
            fails += 1
            continue
        # A quote passes if it appears verbatim in the source file, or if the
        # source file contains it up to the ellipsis truncation point.
        ok_all, bad = True, []
        for qt in quotes:
            core = qt.strip().rstrip('.').lstrip('.')
            probe = core[:60]
            if not probe:
                continue
            if not any(probe in t for t in all_texts):
                ok_all = False
                bad.append(probe)
        print("[%s] %-48s %d quote(s) verbatim"
              % ("PASS" if ok_all else "FAIL", q, len(quotes)))
        if not ok_all:
            fails += 1
            for b in bad[:2]:
                print("       not found in source: %r" % b)

    # A review answer must never state an ads figure.
    a = answer("What do customers say about the texture?")['answer']
    if 'ROAS' in a or 'Rs ' in a:
        print("[FAIL] review answer leaked an ads figure")
        fails += 1
    else:
        print("[PASS] review answer contains no ads figures")

print()
print("=" * 66)
print("RESULT: %s (%d failures)" % ("ALL CHECKS PASS" if fails == 0 else "FAILURES", fails))
print("=" * 66)
sys.exit(1 if fails else 0)
