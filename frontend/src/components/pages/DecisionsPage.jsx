import React, { useState, useEffect } from 'react'
import { Lightbulb, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Target, IndianRupee, BarChart3 } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

const getPriorityColor = (priority) => {
  switch (priority) {
    case 'High': return '#ef4444'
    case 'Medium': return '#f59e0b'
    case 'Low': return '#10b981'
    default: return '#8b5cf6'
  }
}

const getPriorityIcon = (priority) => {
  switch (priority) {
    case 'High': return <AlertCircle size={20} />
    case 'Medium': return <AlertCircle size={20} />
    case 'Low': return <CheckCircle size={20} />
    default: return <AlertCircle size={20} />
  }
}

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    fetchDecisions()
  }, [])

  const fetchDecisions = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/decisions`)
      setDecisions(await res.json())
    } catch (err) {
      console.error('Failed to fetch decisions:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (index) => {
    setExpanded(prev => ({ ...prev, [index]: !prev[index] }))
  }

  if (loading) {
    return <div className="loading">Analyzing data for decisions...</div>
  }

  const highCount = decisions.filter(d => d.priority === 'High').length
  const mediumCount = decisions.filter(d => d.priority === 'Medium').length

  return (
    <>
      <header className="dashboard-header">
        <h1>Data-Driven Decisions</h1>
        <p>Actionable recommendations ranked by business impact</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Decisions</div>
          <div className="stat-value">{decisions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">High Priority</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{highCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Medium Priority</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{mediumCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Est. Monthly Impact</div>
          <div className="stat-value" style={{ color: '#10b981' }}>₹38L+</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {decisions.map((decision, index) => {
          const color = getPriorityColor(decision.priority)
          const isExpanded = expanded[index]

          return (
            <div
              key={index}
              className="chart-card"
              style={{ borderLeft: `4px solid ${color}`, padding: '20px' }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                onClick={() => toggleExpand(index)}
              >
                <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: `${color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: color,
                    flexShrink: 0,
                  }}>
                    {getPriorityIcon(decision.priority)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1rem' }}>{index + 1}. {decision.decision_title}</h3>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: `${color}20`,
                        color: color,
                      }}>
                        {decision.priority} Priority
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        background: 'rgba(139, 92, 246, 0.2)',
                        color: '#8b5cf6',
                      }}>
                        Confidence: {(decision.confidence_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p style={{ color: '#a0a0b8', fontSize: '0.85rem' }}>
                      {decision.what_happened.substring(0, 150)}...
                    </p>
                  </div>
                </div>
                <div style={{ color: '#6a6a80', marginLeft: '16px' }}>
                  {isExpanded ? '▲' : '▼'}
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2a2a3a' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ color: '#a0a0b8', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BarChart3 size={14} />
                      What Happened
                    </h4>
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem' }}>{decision.what_happened}</p>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ color: '#a0a0b8', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Target size={14} />
                      Why It Matters
                    </h4>
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem' }}>{decision.why_it_matters}</p>
                  </div>

                  <div style={{
                    background: 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                  }}>
                    <h4 style={{ color: '#8b5cf6', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <IndianRupee size={14} />
                      Business Impact
                    </h4>
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem' }}>{decision.business_impact}</p>
                  </div>

                  <div style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                  }}>
                    <h4 style={{ color: '#10b981', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} />
                      Recommended Action
                    </h4>
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{decision.recommended_action}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
