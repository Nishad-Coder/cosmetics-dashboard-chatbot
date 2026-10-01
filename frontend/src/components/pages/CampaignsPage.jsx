import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Search, ChevronUp, ChevronDown } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

const formatINR = (num) => {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`
  return `₹${num.toFixed(0)}`
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

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

// Calculate row color based on profit/loss
const getRowColor = (campaign, allCampaigns) => {
  const profit = campaign.revenue - campaign.spend
  
  // Negligible threshold: below 100k
  const negligibleThreshold = 100000
  
  // If profit/loss is negligible (below 100k), color goldenrod
  if (Math.abs(profit) < negligibleThreshold) {
    return `rgb(218, 165, 32)`
  }
  
  // All profitable campaigns
  if (profit > 0) {
    return `rgb(0, 128, 0)`
  }
  
  // All loss-making campaigns
  return `rgb(139, 0, 0)`
}

// Get text color based on background color for maximum contrast
const getTextColor = (campaign, allCampaigns) => {
  const profit = campaign.revenue - campaign.spend
  const profits = allCampaigns.map(c => c.revenue - c.spend)
  const minProfit = Math.min(...profits)
  const maxProfit = Math.max(...profits)
  
  // Dark backgrounds need white text
  if (profit === maxProfit) return '#fff'       // bright green bg → white text
  if (profit === minProfit) return '#fff'       // bright red bg → white text
  if (Math.abs(profit) < 100000) return '#000'  // gold bg → black text
  if (profit > 0) return '#fff'                  // dark green bg → white text
  return '#fff'                                 // dark red bg → white text
}

// Get performance signal based on the guidelines
const getPerformanceSignal = (campaign, allCampaigns) => {
  const avgCTR = allCampaigns.reduce((sum, c) => sum + c.ctr, 0) / allCampaigns.length
  const avgCPA = allCampaigns.reduce((sum, c) => sum + c.cpa, 0) / allCampaigns.length
  const avgROAS = allCampaigns.reduce((sum, c) => sum + c.roas, 0) / allCampaigns.length
  
  const signals = []
  
  // Signal 1: CTR below average
  if (campaign.ctr < avgCTR * 0.9) {
    signals.push('CTR below avg')
  }
  
  // Signal 2: CPA above average
  if (campaign.cpa > avgCPA * 1.1) {
    signals.push('CPA above avg')
  }
  
  // Signal 3: ROAS below average
  if (campaign.roas < avgROAS * 0.9) {
    signals.push('ROAS below avg')
  }
  
  // Signal 4: High spend, low ROAS
  const avgSpend = allCampaigns.reduce((sum, c) => sum + c.spend, 0) / allCampaigns.length
  if (campaign.spend > avgSpend && campaign.roas < avgROAS) {
    signals.push('High spend + low ROAS')
  }
  
  return signals.length > 0 ? signals : ['Performing well']
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([])
  const [adsets, setAdsets] = useState([])
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('spend')
  const [sortOrder, setSortOrder] = useState('desc')
  const [hoveredRow, setHoveredRow] = useState(null)

  useEffect(() => {
    fetchCampaigns()
  }, [])

  useEffect(() => {
    if (selectedCampaign) {
      fetchAdsets(selectedCampaign)
    }
  }, [selectedCampaign])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/campaigns`)
      setCampaigns(await res.json())
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAdsets = async (campaign) => {
    try {
      const res = await fetch(`${API_BASE}/adsets?campaign=${encodeURIComponent(campaign)}`)
      setAdsets(await res.json())
    } catch (err) {
      console.error('Failed to fetch adsets:', err)
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const filtered = campaigns
    .filter(c => c.campaign.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortField] || 0
      const bVal = b[sortField] || 0
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal > bVal ? -1 : 1)
    })

  const pieData = campaigns.map(c => ({
    name: c.campaign.replace(/_/g, ' '),
    value: c.spend,
  }))

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}><ChevronUp size={14} /></span>
    return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  return (
    <>
      <header className="dashboard-header">
        <h1>Campaign Performance</h1>
        <p>Compare campaigns and drill down into adset performance</p>
      </header>

      <div className="filters-section">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6a6a80' }} />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 42px',
                background: '#1a1a24',
                border: '1px solid #2a2a3a',
                borderRadius: '10px',
                color: '#e8e8f0',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading campaigns...</div>
      ) : (
        <>
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Spend by Campaign</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <h3>Campaign Comparison</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaigns} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                    <XAxis type="number" stroke="#6a6a80" fontSize={11} tickFormatter={(v) => formatINR(v)} />
                    <YAxis dataKey="campaign" type="category" stroke="#6a6a80" fontSize={10} width={150} tickFormatter={(v) => v.replace(/_/g, ' ').substring(0, 20)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="spend" fill="#8b5cf6" name="Spend" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="data-table-section">
            <h3>Campaign Details</h3>
            <div style={{ marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgb(0, 128, 0)' }} />
                <span style={{ fontSize: '0.8rem', color: '#a0a0b8' }}>Profitable</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgb(218, 165, 32)' }} />
                <span style={{ fontSize: '0.8rem', color: '#a0a0b8' }}>Near-Break-Even (&lt;1L)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgb(139, 0, 0)' }} />
                <span style={{ fontSize: '0.8rem', color: '#a0a0b8' }}>Loss Making</span>
              </div>
            </div>
            <table className="data-table campaign-details-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('campaign')} style={{ cursor: 'pointer' }}>Campaign <SortIcon field="campaign" /></th>
                  <th>Objective</th>
                  <th className="numeric" onClick={() => handleSort('spend')} style={{ cursor: 'pointer' }}>Spend <SortIcon field="spend" /></th>
                  <th className="numeric" onClick={() => handleSort('revenue')} style={{ cursor: 'pointer' }}>Revenue <SortIcon field="revenue" /></th>
                  <th className="numeric">Profit/Loss</th>
                  <th className="numeric" onClick={() => handleSort('impressions')} style={{ cursor: 'pointer' }}>Impressions <SortIcon field="impressions" /></th>
                  <th className="numeric" onClick={() => handleSort('clicks')} style={{ cursor: 'pointer' }}>Clicks <SortIcon field="clicks" /></th>
                  <th className="numeric" onClick={() => handleSort('ctr')} style={{ cursor: 'pointer' }}>CTR <SortIcon field="ctr" /></th>
                  <th className="numeric" onClick={() => handleSort('roas')} style={{ cursor: 'pointer' }}>ROAS <SortIcon field="roas" /></th>
                  <th className="numeric" onClick={() => handleSort('cpa')} style={{ cursor: 'pointer' }}>CPA <SortIcon field="cpa" /></th>
                  <th className="numeric" onClick={() => handleSort('purchases')} style={{ cursor: 'pointer' }}>Purchases <SortIcon field="purchases" /></th>
                  <th>Signals</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((campaign, index) => {
                  const profit = campaign.revenue - campaign.spend
                  const rowColor = getRowColor(campaign, campaigns)
                  const signals = getPerformanceSignal(campaign, campaigns)

                  return (
                    <tr
                      key={index}
                      onClick={() => setSelectedCampaign(campaign.campaign)}
                      onMouseEnter={() => setHoveredRow(index)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        cursor: 'pointer',
                        background: hoveredRow === index
                          ? rowColor
                          : selectedCampaign === campaign.campaign
                            ? 'rgba(139, 92, 246, 0.15)'
                            : 'transparent',
                        color: hoveredRow === index ? '#000' : '#e8e8f0',
                        fontWeight: hoveredRow === index ? '600' : '400',
                        transition: 'background 0.2s ease, color 0.2s ease',
                      }}
                    >
                      <td>{campaign.campaign.replace(/_/g, ' ')}</td>
                      <td>{campaign.objective}</td>
                      <td className="numeric">{formatINR(campaign.spend)}</td>
                      <td className="numeric">{formatINR(campaign.revenue)}</td>
                      <td className="numeric" style={{ color: profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {profit >= 0 ? '+' : ''}{formatINR(profit)}
                      </td>
                      <td className="numeric">{campaign.impressions.toLocaleString()}</td>
                      <td className="numeric">{campaign.clicks.toLocaleString()}</td>
                      <td className="numeric">{campaign.ctr.toFixed(2)}%</td>
                      <td className="numeric">{campaign.roas.toFixed(2)}x</td>
                      <td className="numeric">₹{campaign.cpa.toFixed(0)}</td>
                      <td className="numeric">{campaign.purchases.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {signals.map((signal, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                background: signal === 'Performing well' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                color: signal === 'Performing well' ? '#10b981' : '#f59e0b',
                              }}
                            >
                              {signal}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selectedCampaign && adsets.length > 0 && (
            <div className="data-table-section">
              <h3>Adset Breakdown: {selectedCampaign.replace(/_/g, ' ')}</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Adset</th>
                    <th className="numeric">Spend</th>
                    <th className="numeric">Revenue</th>
                    <th className="numeric">Profit/Loss</th>
                    <th className="numeric">Impressions</th>
                    <th className="numeric">Clicks</th>
                    <th className="numeric">CTR</th>
                    <th className="numeric">ROAS</th>
                    <th className="numeric">CPA</th>
                    <th className="numeric">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {adsets.map((adset, index) => {
                    const profit = adset.revenue - adset.spend
                    return (
                      <tr key={index}>
                        <td>{adset.adset.replace(/_/g, ' ')}</td>
                        <td className="numeric">{formatINR(adset.spend)}</td>
                        <td className="numeric">{formatINR(adset.revenue)}</td>
                        <td className="numeric" style={{ color: profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          {profit >= 0 ? '+' : ''}{formatINR(profit)}
                        </td>
                        <td className="numeric">{adset.impressions.toLocaleString()}</td>
                        <td className="numeric">{adset.clicks.toLocaleString()}</td>
                        <td className="numeric">{adset.ctr.toFixed(2)}%</td>
                        <td className="numeric">{adset.roas.toFixed(2)}x</td>
                        <td className="numeric">₹{adset.cpa.toFixed(0)}</td>
                        <td className="numeric">{adset.purchases.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
