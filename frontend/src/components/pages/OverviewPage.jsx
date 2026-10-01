import React, { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar,
} from 'recharts'
import { TrendingUp, IndianRupee, Eye, MousePointer, Target } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

const formatINR = (num) => {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`
  return `₹${num.toFixed(0)}`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#1e1e2a',
        border: '1px solid #2a2a3a',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      }}>
        <p style={{ color: '#e8e8f0', marginBottom: '4px', fontWeight: 600 }}>{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color, fontSize: '0.875rem' }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function OverviewPage({ stats }) {
  const [timeSeries, setTimeSeries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTimeSeries()
  }, [])

  const fetchTimeSeries = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/timeseries`)
      setTimeSeries(await res.json())
    } catch (err) {
      console.error('Failed to fetch time series:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!stats) return null

  const statCards = [
    { label: 'Total Spend', value: formatINR(stats.total_spend), icon: <IndianRupee size={20} />, color: '#f59e0b' },
    { label: 'Total Revenue', value: formatINR(stats.total_revenue), icon: <TrendingUp size={20} />, color: '#10b981' },
    { label: 'Total Impressions', value: (stats.total_impressions / 1000000).toFixed(1) + 'M', icon: <Eye size={20} />, color: '#06b6d4' },
    { label: 'Total Clicks', value: (stats.total_clicks / 1000).toFixed(0) + 'K', icon: <MousePointer size={20} />, color: '#8b5cf6' },
    { label: 'Avg CTR', value: stats.avg_ctr + '%', icon: <Target size={20} />, color: '#ec4899' },
    { label: 'Avg ROAS', value: stats.avg_roas + 'x', icon: <TrendingUp size={20} />, color: '#10b981' },
    { label: 'Avg CPA', value: '₹' + stats.avg_cpa.toFixed(0), icon: <IndianRupee size={20} />, color: '#f59e0b' },
    { label: 'Purchases', value: stats.total_purchases.toLocaleString(), icon: <Target size={20} />, color: '#8b5cf6' },
  ]

  return (
    <>
      <header className="dashboard-header">
        <h1>Marketing Performance Overview</h1>
        <p>Daily spend, ROAS, CTR and CPA trends | {stats.date_range?.start} to {stats.date_range?.end}</p>
      </header>

      <div className="stats-grid">
        {statCards.map((card, index) => (
          <div key={index} className="stat-card">
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: card.color }}>{card.icon}</span>
              {card.label}
            </div>
            <div className="stat-value">{card.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading charts...</div>
      ) : (
        <div className="charts-grid">
          <div className="chart-card">
            <h3>Daily Spend & Revenue</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="date" stroke="#6a6a80" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                  <YAxis stroke="#6a6a80" fontSize={11} tickFormatter={(v) => formatINR(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="spend" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} name="Spend" />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>Daily ROAS</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="date" stroke="#6a6a80" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                  <YAxis stroke="#6a6a80" fontSize={11} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="roas" stroke="#10b981" strokeWidth={2} dot={false} name="ROAS" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>Daily CTR (%)</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="date" stroke="#6a6a80" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                  <YAxis stroke="#6a6a80" fontSize={11} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="ctr" stroke="#8b5cf6" strokeWidth={2} dot={false} name="CTR %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>Daily CPA (₹)</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="date" stroke="#6a6a80" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                  <YAxis stroke="#6a6a80" fontSize={11} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="cpa" fill="#f59e0b" name="CPA" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
