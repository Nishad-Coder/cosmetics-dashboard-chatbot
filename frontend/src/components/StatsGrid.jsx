import React from 'react'
import { TrendingUp, Eye, MousePointer, DollarSign, Target, BarChart3 } from 'lucide-react'

function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toLocaleString()
}

function formatCurrency(num) {
  return '$' + formatNumber(num)
}

export default function StatsGrid({ stats }) {
  if (!stats) return null

  const statCards = [
    {
      label: 'Total Campaigns',
      value: stats.total_campaigns.toLocaleString(),
      icon: <BarChart3 size={20} />,
      color: 'var(--accent-primary)',
    },
    {
      label: 'Total Impressions',
      value: formatNumber(stats.total_impressions),
      icon: <Eye size={20} />,
      color: 'var(--accent-secondary)',
    },
    {
      label: 'Total Clicks',
      value: formatNumber(stats.total_clicks),
      icon: <MousePointer size={20} />,
      color: 'var(--accent-success)',
    },
    {
      label: 'Total Spend',
      value: formatCurrency(stats.total_spend),
      icon: <DollarSign size={20} />,
      color: 'var(--accent-warning)',
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(stats.total_revenue),
      icon: <TrendingUp size={20} />,
      color: 'var(--accent-success)',
    },
    {
      label: 'Avg CTR',
      value: stats.avg_ctr + '%',
      icon: <Target size={20} />,
      color: 'var(--accent-primary)',
    },
    {
      label: 'Avg ROAS',
      value: stats.avg_roas + 'x',
      icon: <TrendingUp size={20} />,
      color: 'var(--accent-secondary)',
    },
    {
      label: 'Avg CPC',
      value: '$' + stats.avg_cpc.toFixed(2),
      icon: <DollarSign size={20} />,
      color: 'var(--accent-warning)',
    },
  ]

  return (
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
  )
}
