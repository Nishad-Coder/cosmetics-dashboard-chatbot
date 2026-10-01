import React from 'react'

function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toLocaleString()
}

function formatCurrency(num) {
  return '$' + formatNumber(num)
}

export default function DataTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="data-table-section">
        <h3>Campaign Details</h3>
        <p style={{ color: 'var(--text-secondary)' }}>No data available for selected filters.</p>
      </div>
    )
  }

  return (
    <div className="data-table-section">
      <h3>Campaign Details (Top 50)</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Campaign ID</th>
            <th>Brand</th>
            <th>Category</th>
            <th>Platform</th>
            <th>Format</th>
            <th>Region</th>
            <th>Date</th>
            <th className="numeric">Impressions</th>
            <th className="numeric">Clicks</th>
            <th className="numeric">CTR</th>
            <th className="numeric">Spend</th>
            <th className="numeric">Revenue</th>
            <th className="numeric">ROAS</th>
            <th className="numeric">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index}>
              <td>{row.campaign_id}</td>
              <td>{row.brand}</td>
              <td>{row.product_category}</td>
              <td>{row.ad_platform}</td>
              <td>{row.ad_format}</td>
              <td>{row.region}</td>
              <td>{row.date}</td>
              <td className="numeric">{formatNumber(row.impressions)}</td>
              <td className="numeric">{formatNumber(row.clicks)}</td>
              <td className="numeric">{row.ctr}%</td>
              <td className="numeric">{formatCurrency(row.spend)}</td>
              <td className="numeric">{formatCurrency(row.revenue)}</td>
              <td className="numeric">{row.roas}x</td>
              <td className="numeric">{formatNumber(row.conversions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
