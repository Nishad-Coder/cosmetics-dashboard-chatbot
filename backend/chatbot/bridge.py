"""
bridge.py -- Node <-> Python bridge for the chatbot.

The numbers engine lives in Python (engine.py) and the trained model is
PyTorch, so we expose it to the Express backend over a line-delimited JSON
protocol on stdin/stdout. One JSON request per line, one JSON reply per line.

Protocol
--------
stdin  : {"id": "<req-id>", "op": "answer"|"suggestions"|"ping",
          "question": "..."}
stdout : {"id": "<req-id>", "ok": true,  "answer": "...", "sources": [...],
          "intents": [...]}
         {"id": "<req-id>", "ok": false, "error": "..."}

Kept deliberately tiny: the Node side owns HTTP, this process owns compute.
"""

import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine  # noqa: E402


def log(msg):
    # stderr only, so it never corrupts the stdout protocol
    sys.stderr.write("[bridge] %s\n" % msg)
    sys.stderr.flush()


def handle(req):
    op = req.get("op", "answer")

    if op == "ping":
        return {"ok": True, "pong": True, "campaigns": engine.store().campaign_names}

    if op == "suggestions":
        return {"ok": True, "suggestions": engine.SUGGESTIONS}

    if op == "campaigns":
        return {"ok": True, "campaigns": engine.store().campaign_names}

    if op == "answer":
        q = (req.get("question") or "").strip()
        if not q:
            return {"ok": False, "error": "empty question"}
        r = engine.answer(q)
        return {
            "ok": True,
            "answer": r["answer"],
            "sources": r.get("sources", []),
            "intents": r.get("intents", []),
        }

    return {"ok": False, "error": "unknown op: %s" % op}


def main():
    # Windows Python defaults stdout to cp1252, which cannot encode the rupee
    # sign in decisions.json. Reconfigure so the JSON protocol never dies on
    # non-ASCII content.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:  # pragma: no cover - Python < 3.7
        pass

    log("bridge ready, %d campaigns indexed" % len(engine.store().campaign_names))
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            res = handle(req)
        except Exception as exc:  # never die on one bad request
            log("error: %s\n%s" % (exc, traceback.format_exc()))
            res = {"ok": False, "error": str(exc)}
        res["id"] = req_id
        sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
