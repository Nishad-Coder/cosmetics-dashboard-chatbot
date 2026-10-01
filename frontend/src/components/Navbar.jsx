import React, { useState } from 'react'
import { LayoutGrid, Table, Lightbulb, AlertTriangle } from 'lucide-react'

export default function Navbar({ activeSection, onNavigate }) {
  const [hoveredItem, setHoveredItem] = useState(null)

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <LayoutGrid size={18} /> },
    { id: 'campaigns', label: 'Campaigns', icon: <Table size={18} /> },
    { id: 'decisions', label: 'Decisions', icon: <Lightbulb size={18} /> },
    { id: 'anomalies', label: 'Anomalies', icon: <AlertTriangle size={18} /> },
  ]

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <a
          className="brand-logo"
          href="https://www.dotandkey.com/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Dot &amp; Key - visit dotandkey.com"
          title="Dot &amp; Key"
        >
          <span className="brand-logo-track">
            <img className="brand-logo-img" src="/logo-dotandkey.svg" alt="Dot &amp; Key" />
            <img className="brand-logo-tagline" src="/logo-feels-good.svg" alt="Feels good" />
          </span>
        </a>
      </div>

      <div className="navbar-menu">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            <span className="nav-indicator" />
            <span className="nav-glow" />
          </button>
        ))}
      </div>

      <div className="navbar-actions">
        <div className="status-badge">
          <span className="status-dot" />
          Live Data
        </div>
        </div>
    </nav>
  )
}
