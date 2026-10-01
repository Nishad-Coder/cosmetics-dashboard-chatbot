import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
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

export default function CompetitorsPage() {
  const [brands, setBrands] = useState([])
  const [selectedBrands, setSelectedBrands] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBrands()
  }, [])

  const fetchBrands = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/aggregate/brand`)
      const data = await res.json()
      setBrands(data)
      setSelectedBrands(data.slice(0, 5).map(b => b.brand))
    } catch (err) {
      console.error('Failed to fetch brands:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleBrand = (brand) => {
    setSelectedBrands(prev =>
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    )
  }

  const radarData = selectedBrands.map(brand => {
    const brandData = brands.find(b => b.brand === brand)
    if (!brandData) return null
    return {
      brand,
      roas: brandData.avg_roas,
      ctr: brandData.avg_ctr,
      spend: brandData.total_spend / 1000,
      revenue: brandData.total_revenue / 1000,
      conversions: brandData.total_conversions,
    }
  }).filter(Boolean)

  const barData = brands.slice(0, 15).map(b => ({
    name: b.brand,
    spend: b.total_spend,
    revenue: b.total_revenue,
    roas: b.avg_roas,
    campaigns: b.count,
  }))

  return (
    <>
      <header className="dashboard-header">
        <h1>Competitor Analysis</h1>
        <p>Compare brand performance and market positioning</p>
      </header>

      <div className="filters-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>Select Brands to Compare</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSelectedBrands(brands.map(b => b.brand))}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #2a2a3a',
                background: 'transparent',
                color: '#a0a0b8',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedBrands([])}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #2a2a3a',
                background: 'transparent',
                color: '#a0a0b8',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
            >
              Deselect All
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {brands.map(brand => (
            <button
              key={brand.brand}
              onClick={() => toggleBrand(brand.brand)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: '1px solid',
                borderColor: selectedBrands.includes(brand.brand) ? '#8b5cf6' : '#2a2a3a',
                background: selectedBrands.includes(brand.brand) ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                color: selectedBrands.includes(brand.brand) ? '#e8e8f0' : '#a0a0b8',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
            >
              {brand.brand}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading competitor data...</div>
      ) : (
        <div className="charts-grid">
          <div className="chart-card">
            <h3>Top 15 Brands by Spend</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis type="number" stroke="#6a6a80" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="#6a6a80" fontSize={11} width={130} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="spend" fill="#8b5cf6" name="Spend" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="revenue" fill="#06b6d4" name="Revenue" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>Brand Comparison Radar</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#2a2a3a" />
                  <PolarAngleAxis dataKey="brand" stroke="#6a6a80" fontSize={11} />
                  <PolarRadiusAxis stroke="#6a6a80" fontSize={10} />
                  <Radar name="ROAS" dataKey="roas" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                  <Radar name="CTR" dataKey="ctr" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
            <h3>Brand Performance Summary</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th className="numeric">Campaigns</th>
                  <th className="numeric">Total Spend</th>
                  <th className="numeric">Total Revenue</th>
                  <th className="numeric">Avg ROAS</th>
                  <th className="numeric">Avg CTR</th>
                  <th className="numeric">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {brands.slice(0, 20).map(brand => (
                  <tr key={brand.brand}>
                    <td>{brand.brand}</td>
                    <td className="numeric">{brand.count}</td>
                    <td className="numeric">${brand.total_spend.toLocaleString()}</td>
                    <td className="numeric">${brand.total_revenue.toLocaleString()}</td>
                    <td className="numeric">{brand.avg_roas}x</td>
                    <td className="numeric">{brand.avg_ctr}%</td>
                    <td className="numeric">{brand.total_conversions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
