import React from 'react'
import { Filter, X } from 'lucide-react'

export default function FiltersSection({ filters, activeFilters, onFilterChange }) {
  if (!filters) return null

  const hasActiveFilters = Object.values(activeFilters).some(v => v !== '')

  const clearFilters = () => {
    Object.keys(activeFilters).forEach(key => onFilterChange(key, ''))
  }

  return (
    <div className="filters-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={18} />
          Filters
        </h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: 'var(--text-secondary)',
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
        <div className="filter-group">
          <label>Brand</label>
          <select
            value={activeFilters.brand}
            onChange={(e) => onFilterChange('brand', e.target.value)}
          >
            <option value="">All Brands</option>
            {filters.brands.map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Platform</label>
          <select
            value={activeFilters.platform}
            onChange={(e) => onFilterChange('platform', e.target.value)}
          >
            <option value="">All Platforms</option>
            {filters.platforms.map(platform => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Category</label>
          <select
            value={activeFilters.category}
            onChange={(e) => onFilterChange('category', e.target.value)}
          >
            <option value="">All Categories</option>
            {filters.categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Region</label>
          <select
            value={activeFilters.region}
            onChange={(e) => onFilterChange('region', e.target.value)}
          >
            <option value="">All Regions</option>
            {filters.regions.map(region => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
