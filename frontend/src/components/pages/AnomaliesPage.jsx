import React, { useState, useEffect } from 'react'
import { AlertTriangle, TrendingDown, IndianRupee, Target, ChevronDown, ChevronUp, Lightbulb, AlertCircle, CheckCircle } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

const getSeverityColor = (severity) => {
  switch (severity) {
    case 'Critical': return '#ef4444'
    case 'High': return '#f59e0b'
    case 'Medium': return '#06b6d4'
    case 'Low': return '#10b981'
    default: return '#8b5cf6'
  }
}

const getSeverityIcon = (severity) => {
  switch (severity) {
    case 'Critical': return <AlertTriangle size={20} />
    case 'High': return <AlertCircle size={20} />
    case 'Medium': return <AlertCircle size={20} />
    case 'Low': return <CheckCircle size={20} />
    default: return <AlertTriangle size={20} />
  }
}

const getAnomalyTypeIcon = (type) => {
  if (type.includes('Revenue')) return <IndianRupee size={16} />
  if (type.includes('CPA')) return <Target size={16} />
  if (type.includes('Budget')) return <IndianRupee size={16} />
  if (type.includes('Conversion')) return <TrendingDown size={16} />
  return <AlertCircle size={16} />
}

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    fetchAnomalies()
  }, [])

  const fetchAnomalies = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/anomalies`)
      setAnomalies(await res.json())
    } catch (err) {
      console.error('Failed to fetch anomalies:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (index) => {
    setExpanded(prev => ({ ...prev, [index]: !prev[index] }))
  }

  if (loading) {
    return <div className="loading">Analyzing data for anomalies...</div>
  }

  const criticalCount = anomalies.filter(a => a.severity === 'Critical').length
  const highCount = anomalies.filter(a => a.severity === 'High').length
  const mediumCount = anomalies.filter(a => a.severity === 'Medium').length

  return (
    <>
      <header className="dashboard-header">
        <h1>Anomaly Detection</h1>
        <p>Statistically significant anomalies identified in your advertising data</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Anomalies</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{anomalies.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{criticalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">High</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{highCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Medium</div>
          <div className="stat-value" style={{ color: '#06b6d4' }}>{mediumCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {anomalies.map((anomaly, index) => {
          const color = getSeverityColor(anomaly.severity)
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
                    {getSeverityIcon(anomaly.severity)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1rem' }}>{anomaly.anomaly_type}</h3>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: `${color}20`,
                        color: color,
                      }}>
                        {anomaly.severity}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        background: 'rgba(139, 92, 246, 0.2)',
                        color: '#8b5cf6',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        {getAnomalyTypeIcon(anomaly.anomaly_type)}
                        {anomaly.metric}
                      </span>
                    </div>
                    <p style={{ color: '#a0a0b8', fontSize: '0.85rem', marginBottom: '4px' }}>
                      {anomaly.date_range} | {anomaly.campaign} | {anomaly.adset}
                    </p>
                    <p style={{ color: '#e8e8f0', fontSize: '0.85rem' }}>
                      Actual: {anomaly.actual_value} | Expected: {anomaly.expected_value} | Deviation: {anomaly.deviation_percent}%
                    </p>
                  </div>
                </div>
                <div style={{ color: '#6a6a80', marginLeft: '16px' }}>
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2a2a3a' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ color: '#a0a0b8', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={14} />
                      Why This Was Flagged
                    </h4>
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem' }}>{anomaly.business_explanation}</p>
                  </div>

                  <div style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                  }}>
                    <h4 style={{ color: '#f59e0b', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Lightbulb size={14} />
                      Root Cause Hypothesis
                    </h4>
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem' }}>{anomaly.root_cause_hypothesis}</p>
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
                      Estimated Business Impact
                    </h4>
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem' }}>{anomaly.estimated_impact}</p>
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
                    <p style={{ color: '#e8e8f0', lineHeight: 1.7, fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{anomaly.recommended_action}</p>
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
