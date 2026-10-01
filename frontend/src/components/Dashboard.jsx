import React, { useState, useEffect } from 'react'
import Navbar from './Navbar'
import ParticleBackground from './ParticleBackground'
import OverviewPage from './pages/OverviewPage'
import CampaignsPage from './pages/CampaignsPage'
import DecisionsPage from './pages/DecisionsPage'
import AnomaliesPage from './pages/AnomaliesPage'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api'

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState('overview')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const statsRes = await fetch(`${API_BASE}/stats`)
      setStats(await statsRes.json())
      setError(null)
    } catch (err) {
      setError('Failed to load data. Please ensure the backend server is running.')
    } finally {
      setLoading(false)
    }
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewPage stats={stats} />
      case 'campaigns':
        return <CampaignsPage />
      case 'decisions':
        return <DecisionsPage />
      case 'anomalies':
        return <AnomaliesPage />
      default:
        return <OverviewPage stats={stats} />
    }
  }

  return (
    <div className="dashboard-wrapper">
      <ParticleBackground />
      <Navbar activeSection={activeSection} onNavigate={setActiveSection} />
      <div className="dashboard-content">
        {loading && activeSection === 'overview' ? (
          <div className="loading">Loading data...</div>
        ) : error && activeSection === 'overview' ? (
          <div className="error">{error}</div>
        ) : (
          renderSection()
        )}
      </div>
    </div>
  )
}
