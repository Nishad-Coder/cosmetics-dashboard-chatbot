import React, { useState, useEffect } from 'react'
import { Download, FileText, TrendingUp, Award, AlertTriangle } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

export default function ReportsPage() {
  const [stats, setStats] = useState(null)
  const [topBrands, setTopBrands] = useState([])
  const [topPlatforms, setTopPlatforms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReportData()
  }, [])

  const fetchReportData = async () => {
    try {
      setLoading(true)
      const [statsRes, brandRes, platformRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/aggregate/brand`),
        fetch(`${API_BASE}/aggregate/ad_platform`),
      ])

      setStats(await statsRes.json())
      setTopBrands((await brandRes.json()).slice(0, 5))
      setTopPlatforms((await platformRes.json()).slice(0, 5))
    } catch (err) {
      console.error('Failed to fetch report data:', err)
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    const headers = ['Metric', 'Value']
    const rows = [
      ['Total Campaigns', stats?.total_campaigns],
      ['Total Impressions', stats?.total_impressions],
      ['Total Clicks', stats?.total_clicks],
      ['Total Spend', stats?.total_spend],
      ['Total Revenue', stats?.total_revenue],
      ['Total Conversions', stats?.total_conversions],
      ['Avg CTR', stats?.avg_ctr + '%'],
      ['Avg ROAS', stats?.avg_roas + 'x'],
      ['Avg CPC', '$' + stats?.avg_cpc],
      ['Avg CPM', '$' + stats?.avg_cpm],
    ]

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cosmetics-ads-report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="loading">Generating report...</div>
  }

  return (
    <>
      <header className="dashboard-header">
        <h1>Reports</h1>
        <p>Summary reports and exportable insights</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} style={{ color: 'var(--accent-success)' }} />
            Total Revenue
          </div>
          <div className="stat-value">${stats?.total_revenue?.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={20} style={{ color: 'var(--accent-primary)' }} />
            Best ROAS
          </div>
          <div className="stat-value">{topBrands[0]?.avg_roas}x</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            {topBrands[0]?.brand}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} style={{ color: 'var(--accent-secondary)' }} />
            Total Campaigns
          </div>
          <div className="stat-value">{stats?.total_campaigns}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} style={{ color: 'var(--accent-warning)' }} />
            Avg CPC
          </div>
          <div className="stat-value">${stats?.avg_cpc}</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Top 5 Brands by Revenue</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Brand</th>
                <th className="numeric">Revenue</th>
                <th className="numeric">ROAS</th>
                <th className="numeric">Campaigns</th>
              </tr>
            </thead>
            <tbody>
              {topBrands.map((brand, index) => (
                <tr key={brand.brand}>
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: index === 0 ? 'linear-gradient(135deg, #f59e0b, #f97316)' : '#2a2a3a',
                      color: index === 0 ? '#fff' : '#a0a0b8',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                    }}>
                      {index + 1}
                    </span>
                  </td>
                  <td>{brand.brand}</td>
                  <td className="numeric">${brand.total_revenue.toLocaleString()}</td>
                  <td className="numeric">{brand.avg_roas}x</td>
                  <td className="numeric">{brand.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="chart-card">
          <h3>Top 5 Platforms by Spend</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Platform</th>
                <th className="numeric">Spend</th>
                <th className="numeric">Revenue</th>
                <th className="numeric">Campaigns</th>
              </tr>
            </thead>
            <tbody>
              {topPlatforms.map((platform, index) => (
                <tr key={platform.ad_platform}>
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: index === 0 ? 'linear-gradient(135deg, #8b5cf6, #06b6d4)' : '#2a2a3a',
                      color: index === 0 ? '#fff' : '#a0a0b8',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                    }}>
                      {index + 1}
                    </span>
                  </td>
                  <td>{platform.ad_platform}</td>
                  <td className="numeric">${platform.total_spend.toLocaleString()}</td>
                  <td className="numeric">${platform.total_revenue.toLocaleString()}</td>
                  <td className="numeric">{platform.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-card" style={{ textAlign: 'center', padding: '40px' }}>
        <h3 style={{ marginBottom: '12px' }}>Export Report</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Download a CSV summary of all key metrics
        </p>
        <button
          onClick={exportCSV}
          style={{
            padding: '14px 36px',
            background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'transform 0.2s ease',
          }}
        >
          <Download size={20} />
          Download CSV Report
        </button>
      </div>
    </>
  )
}
