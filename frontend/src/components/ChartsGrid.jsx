import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#3b82f6', '#84cc16', '#f97316', '#6366f1',
]

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

export default function ChartsGrid({ aggregations }) {
  if (!aggregations || !aggregations.brand) return null

  // Prepare data for charts
  const platformData = aggregations.platform.slice(0, 8).map(item => ({
    name: item.ad_platform,
    spend: item.total_spend,
    revenue: item.total_revenue,
    campaigns: item.count,
  }))

  const categoryData = aggregations.category.map(item => ({
    name: item.product_category,
    value: item.total_spend,
  }))

  const brandData = aggregations.brand.slice(0, 10).map(item => ({
    name: item.brand,
    roas: item.avg_roas,
    ctr: item.avg_ctr,
  }))

  const regionData = aggregations.region.map(item => ({
    name: item.region,
    value: item.total_revenue,
  }))

  return (
    <div className="charts-grid">
      <div className="chart-card">
        <h3>Spend vs Revenue by Platform</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={platformData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
              <XAxis dataKey="name" stroke="#6a6a80" fontSize={12} />
              <YAxis stroke="#6a6a80" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="spend" fill="#8b5cf6" name="Spend" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenue" fill="#06b6d4" name="Revenue" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <h3>Spend Distribution by Category</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <h3>Top 10 Brands by ROAS</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brandData} layout="vertical">
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
        <h3>Revenue by Region</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={regionData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {regionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
