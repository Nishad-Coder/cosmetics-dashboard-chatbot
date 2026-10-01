import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis,
} from 'recharts'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

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

export default function AnalyticsPage() {
  const [dimension, setDimension] = useState('ad_platform')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const dimensions = [
    { value: 'ad_platform', label: 'Platform' },
    { value: 'product_category', label: 'Category' },
    { value: 'device', label: 'Device' },
    { value: 'campaign_type', label: 'Campaign Type' },
    { value: 'season', label: 'Season' },
    { value: 'ad_format', label: 'Ad Format' },
  ]

  useEffect(() => {
    fetchData()
  }, [dimension])

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/aggregate/${dimension}`)
      setData(await res.json())
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  const chartData = data.map(item => ({
    name: item[dimension],
    impressions: item.total_impressions,
    clicks: item.total_clicks,
    spend: item.total_spend,
    revenue: item.total_revenue,
    conversions: item.total_conversions,
    roas: item.avg_roas,
    ctr: item.avg_ctr,
  }))

  return (
    <>
      <header className="dashboard-header">
        <h1>Analytics</h1>
        <p>Deep dive into advertisement performance metrics</p>
      </header>

      <div className="filters-section">
        <div className="filter-group" style={{ maxWidth: '300px' }}>
          <label>Group By</label>
          <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
            {dimensions.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading analytics...</div>
      ) : (
        <div className="charts-grid">
          <div className="chart-card">
            <h3>Impressions vs Clicks</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="name" stroke="#6a6a80" fontSize={12} />
                  <YAxis stroke="#6a6a80" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="impressions" fill="#8b5cf6" name="Impressions" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="clicks" fill="#06b6d4" name="Clicks" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>Spend vs Revenue</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="name" stroke="#6a6a80" fontSize={12} />
                  <YAxis stroke="#6a6a80" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="spend" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} name="Spend" />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>ROAS by {dimensions.find(d => d.value === dimension)?.label}</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis type="number" stroke="#6a6a80" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="#6a6a80" fontSize={12} width={120} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="roas" fill="#10b981" name="ROAS" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>CTR vs Conversions</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="ctr" name="CTR" unit="%" stroke="#6a6a80" fontSize={12} />
                  <YAxis dataKey="conversions" name="Conversions" stroke="#6a6a80" fontSize={12} />
                  <ZAxis range={[50, 400]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Scatter data={chartData} fill="#8b5cf6" name="Campaigns" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
