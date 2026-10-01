# Chatbot

**Dot&Key Assistant** — retrieval-based assistant for the cosmetics ads dashboard.
A floating bubble in the bottom-right of the UI opens it; suggested questions
appear on open.

## Architecture

Two sources, two different jobs, deliberately not mixed:

| Need | Source | How |
| --- | --- | --- |
| Ads numbers (spend, revenue, ROAS, CTR, CPA) | `backend/data/ads_performance.csv` | Computed at request time in `engine.py` |
| Anomalies, recommendations | `anomalies.json`, `decisions.json` | Read directly, fields rendered as written |
| Customer sentiment, product experience | `marketplace_reviews_unique_100k.csv` | Real reviews quoted verbatim (`reviews.py`) |

**No figure anywhere in an answer is produced by a language model.** Every
number is computed from the CSV or read from the JSON, and `test_engine.py`
re-derives each one independently and fails if they disagree.

## Files

| File | Role |
| --- | --- |
| `engine.py` | Intent routing, ads aggregation, anomaly/decision rendering, review answering |
| `reviews.py` | Review index (TF-IDF + aspect tagging), verbatim quote selection, caching |
| `bridge.py` | Line-delimited JSON protocol on stdin/stdout; one warm process |
| `../chatbot-client.js` | Node side: spawns `bridge.py`, exposes the HTTP endpoints |
| `test_engine.py` | Number-fidelity and quote-fidelity checks |
| `build_corpus.py`, `train.py`, `probe.py` | Training pipeline and the trained model (see below) |
| `voice.py` | Loads the trained checkpoint. Not used in answers, see "Trained model" |

## Endpoints

```
GET  /api/chatbot/status        { available, lastError }
GET  /api/chatbot/suggestions   { suggestions: [...] }
POST /api/chatbot/ask           { question } -> { answer, sources, intents }
```

## The trained model

`build_corpus.py` assembles 100k review lines plus the ads data rendered as
question/answer pairs, and `train.py` fits a 0.56M-parameter word-level LSTM on
CPU. Training results are good in the usual sense:

```
val loss 1.17, perplexity 3.22, 88.6% better than a unigram baseline
```

**The model is not used to answer questions.** Generation from it produces
ungrammatical output:

```
prompt "the texture"
  -> "feels comfortable enough for me. into my other skincare product.
      The packaging could be a return of the price."
```

The cause is the data, not the training. The corpus has 434 distinct tokens and
every row is assembled from a fixed phrase bank, so a next-token model learns the
template almost perfectly and the sentence structure barely at all. Low
perplexity on templated text and fluent generation are different properties, and
only the first is measured by the loss.

`probe.py` reproduces this. The checkpoint, the training report and the pipeline
are kept because they are the evidence for the decision above, and the pipeline
is ready if a corpus with real sentence diversity is supplied. `voice.py` loads
the checkpoint and strips every digit run from its output, so it cannot be
mistaken for an answer path.

Customer-voice questions therefore quote real reviews instead. An earlier
attempt to improve the model's output by deleting the template boilerplate with
regex substitution was reverted: the result read better but was no longer
verbatim, and the fidelity test in `test_engine.py` correctly rejected it.

## Running the tests

```bash
cd backend/chatbot
python test_engine.py     # exits non-zero on any mismatch
```

Checks performed:
- Account totals and every per-campaign metric re-derived from the raw CSV
- Losses really are negative in the source data
- Every review quote is present verbatim in the reviews CSV
- No ads figure leaks into a review answer

Exit codes: `0` all pass, `1` a check failed.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHATBOT_REVIEWS_CSV` | `C:\Users\deshp\Downloads\marketplace_reviews_unique_100k.csv` | Review corpus |
| `CHATBOT_PYTHON` | `python` on `PATH` | Interpreter for the bridge |

The review index is cached in `cache/reviews_index.pkl`, keyed on the CSV's size
and mtime, so a changed file rebuilds automatically. A cold build over 100k
reviews takes roughly 80 seconds; a cached load is instant.

## Known data limitations

`star_rating` in the reviews file is statistically independent of `review_text`
(measured sentiment gap across 1-5 stars: +0.001), so ratings cannot rank
review sentiment. Answers that show an average say so explicitly rather than
implying a reading the data does not support. Mention counts are the reliable
signal.
