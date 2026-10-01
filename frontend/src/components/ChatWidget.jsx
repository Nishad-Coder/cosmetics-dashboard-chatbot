import React, { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader, Bot } from 'lucide-react'

/**
 * ChatWidget -- "Dot&Key Assistant", the floating assistant for the dashboard.
 *
 * Design note: answers come from /api/chatbot/ask, where the figures are
 * computed server-side from the CSV. Nothing numeric is generated in the
 * browser, so what you read here is what the data says.
 */

const QUICK = [
  'Give me a summary of overall performance',
  'Which campaigns are losing money?',
  'What is the account ROAS?',
  'Which campaigns perform best?',
]

// Conversational opener. A time-of-day greeting ("Good afternoon") plus a
// feature list read like a form letter, so this opens like a person would and
// defers to the suggestion chips below for the specifics.
const GREETING = "Hi! How can I help you today?"

// Minimal, safe markdown: **bold** and *italic* only. No HTML injection.
function renderInline(text) {
  const parts = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    } else {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function AnswerBody({ text }) {
  // Preserve line structure; markdown markers stripped per-line.
  // Each bullet may carry indented continuation lines, which belong inside
  // the same <li> rather than becoming their own (wrongly nested) list item.
  const lines = String(text || '').split('\n')
  const out = []
  let items = []

  const flush = () => {
    if (items.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="chat-bullets">
          {items.map((it, i) => (
            <li key={i}>
              {renderInline(it.head)}
              {it.body.length > 0 && (
                <div className="chat-sub-detail">{it.body.map((b, j) => (
                  <p key={j}>{renderInline(b)}</p>
                ))}</div>
              )}
            </li>
          ))}
        </ul>
      )
      items = []
    }
  }

  for (const raw of lines) {
    if (/^\s*-\s+/.test(raw)) {
      const head = raw.replace(/^\s*-\s+/, '')
      items.push({ head, body: [] })
      continue
    }
    // Indented or wrapped text belongs to the bullet above it.
    if (items.length && /^\s{2,}\S/.test(raw)) {
      items[items.length - 1].body.push(raw.trim())
      continue
    }
    flush()
    if (!raw.trim()) {
      out.push(<div key={`sp-${out.length}`} className="chat-spacer" />)
    } else {
      out.push(<p key={`p-${out.length}`} className="chat-line">{renderInline(raw)}</p>)
    }
  }
  flush()
  return <div className="chat-body-text">{out}</div>
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState(null)
  const [suggestions, setSuggestions] = useState(QUICK)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const idRef = useRef(0)

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/chatbot/status`)
      .then((r) => r.json())
      .then((s) => alive && setAvailable(!!s.available))
      .catch(() => alive && setAvailable(false))
    fetch(`${API_BASE}/chatbot/suggestions`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d.suggestions) && d.suggestions.length) {
          setSuggestions(d.suggestions.slice(0, 4))
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (open) {
      setMessages((prev) => {
        if (prev.length === 0) {
          return [{
            id: ++idRef.current,
            role: 'bot',
            text: GREETING
          }]
        }
        return prev
      })
      setTimeout(() => inputRef.current && inputRef.current.focus(), 60)
    }
  }, [open])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  async function send(text) {
    const q = (text || input).trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { id: ++idRef.current, role: 'user', text: q }])
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/chatbot/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'request failed')
      setMessages((m) => [...m, {
        id: ++idRef.current,
        role: 'bot',
        text: data.answer,
        sources: data.sources,
      }])
    } catch (err) {
      setMessages((m) => [...m, {
        id: ++idRef.current,
        role: 'bot',
        text: `I could not reach the analytics engine (${err.message}). Check that the backend is running on port 3001.`,
        error: true,
      }])
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Dot&Key Assistant">
          <div className="chat-header">
            <div className="chat-title">
              <span className="chat-avatar"><Bot size={16} /></span>
              <div>
                <strong>Dot&amp;Key Assistant</strong>
                <span className="chat-sub">Live figures from your data</span>
              </div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          {available === false && (
            <div className="chat-banner">
              Dot&amp;Key Assistant is unavailable — answers are disabled until the backend connects.
            </div>
          )}

          <div className="chat-log" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role} ${m.error ? 'err' : ''}`}>
                {m.role === 'bot' && <span className="chat-dot"><Bot size={12} /></span>}
                <div className="chat-bubble">
                  <AnswerBody text={m.text} />
                  {m.sources && m.sources.length > 0 && (
                    <div className="chat-src">source: {m.sources.join(', ')}</div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="chat-msg bot">
                <span className="chat-dot"><Bot size={12} /></span>
                <div className="chat-bubble chat-thinking">
                  <Loader size={14} className="chat-spin" /> reading your data…
                </div>
              </div>
            )}
          </div>

          <div className="chat-quick">
            {suggestions.map((s) => (
              <button key={s} className="chat-chip" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>

          <div className="chat-input-row">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about campaigns, spend, ROAS…"
              aria-label="Ask a question"
            />
            <button
              className="chat-send"
              onClick={() => send()}
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <button
        className={`chat-fab ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Dot&Key Assistant' : 'Open Dot&Key Assistant'}
        title={open ? 'Close Dot&Key Assistant' : 'Ask Dot&Key Assistant about your data'}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && available === true && <span className="chat-fab-badge" />}
      </button>
    </>
  )
}
