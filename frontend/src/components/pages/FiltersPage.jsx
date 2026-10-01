import React, { useState, useEffect } from 'react'
import { Filter, X } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

export default function FiltersPage() {
  const [filters, setFilters] = useState({})
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeFilters, setActiveFilters] = useState({
    brand: '',
    platform: '',
    category: '',
    region: '',
    device: '',
    campaign_type: '',
    season: '',
  })

  useEffect(() => {
    fetchFilters()
  }, [])

  const fetchFilters = async () => {
    try {
      const res = await fetch(`${API_BASE}/filters`)
      setFilters(await res.json())
    } catch (err) {
      console.error('Failed to fetch filters:', err)
    }
  }

  const applyFilters = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      Object.entries(activeFilters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      params.append('limit', '100')

      const res = await fetch(`${API_BASE}/ads?${params}`)
      const data = await res.json()
      setResults(data.data)
    } catch (err) {
      console.error('Failed to apply filters:', err)
    } finally {
      setLoading(false)
    }
  }

  const clearFilters = () => {
    const cleared = {}
    Object.keys(activeFilters).forEach(key => { cleared[key] = '' })
    setActiveFilters(cleared)
    setResults([])
  }

  const handleFilterChange = (key, value) => {
    setActiveFilters(prev => ({ ...prev, [key]: value }))
  }

  const filterGroups = [
    { key: 'brand', label: 'Brand', options: filters.brands },
    { key: 'platform', label: 'Platform', options: filters.platforms },
    { key: 'category', label: 'Category', options: filters.categories },
    { key: 'region', label: 'Region', options: filters.regions },
    { key: 'device', label: 'Device', options: filters.devices },
    { key: 'campaign_type', label: 'Campaign Type', options: filters.campaign_types },
    { key: 'season', label: 'Season', options: filters.seasons },
  ]

  const hasActiveFilters = Object.values(activeFilters).some(v => v !== '')

  return (
    <>
      <header className="dashboard-header">
        <h1>Filters</h1>
        <p>Filter and explore advertisement data by multiple criteria</p>
      </header>

      <div className="filters-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} />
            Filter Campaigns
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                background: 'transparent',
                border: '1px solid #2a2a3a',
                borderRadius: '8px',
                padding: '8px 16px',
                color: '#a0a0b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.875rem',
              }}
            >
              <X size={14} />
              Clear all
            </button>
          )}
        </div>

        <div className="filters-grid">
          {filterGroups.map(group => (
            <div key={group.key} className="filter-group">
              <label>{group.label}</label>
              <select
                value={activeFilters[group.key]}
                onChange={(e) => handleFilterChange(group.key, e.target.value)}
              >
                <option value="">All {group.label}s</option>
                {group.options?.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <button
          onClick={applyFilters}
          disabled={!hasActiveFilters || loading}
          style={{
            marginTop: '20px',
            padding: '12px 32px',
            background: hasActiveFilters && !loading ? 'linear-gradient(135deg, #8b5cf6, #06b6d4)' : '#2a2a3a',
            border: 'none',
            borderRadius: '10px',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: hasActiveFilters && !loading ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s ease',
          }}
        >
          {loading ? 'Applying...' : 'Apply Filters'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="data-table-section">
          <h3>Filtered Results ({results.length} campaigns)</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign ID</th>
                <th>Brand</th>
                <th>Platform</th>
                <th>Category</th>
                <th>Region</th>
                <th className="numeric">Impressions</th>
                <th className="numeric">CTR</th>
                <th className="numeric">Spend</th>
                <th className="numeric">Revenue</th>
                <th className="numeric">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 50).map((row, index) => (
                <tr key={index}>
                  <td>{row.campaign_id}</td>
                  <td>{row.brand}</td>
                  <td>{row.ad_platform}</td>
                  <td>{row.product_category}</td>
                  <td>{row.region}</td>
                  <td className="numeric">{row.impressions.toLocaleString()}</td>
                  <td className="numeric">{row.ctr}%</td>
                  <td className="numeric">${row.spend.toLocaleString()}</td>
                  <td className="numeric">${row.revenue.toLocaleString()}</td>
                  <td className="numeric">{row.roas}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
