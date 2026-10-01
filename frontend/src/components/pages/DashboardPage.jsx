import React from 'react'
import StatsGrid from '../StatsGrid'
import ChartsGrid from '../ChartsGrid'

export default function DashboardPage({ stats, aggregations }) {
  return (
    <>
      <header className="dashboard-header">
        <h1>Dashboard Overview</h1>
        <p>Competitor advertisement performance at a glance</p>
      </header>
      <StatsGrid stats={stats} />
      <ChartsGrid aggregations={aggregations} />
    </>
  )
}
