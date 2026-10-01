# Cosmetics Ads Analytics Dashboard

A modern analytics dashboard for cosmetics company competitor advertisement analysis, featuring a React frontend with dark theme, Three.js particle animations, and a Node.js/Express backend.

## Features

- **1000 sample records** of cosmetics advertisement data
- **Interactive charts** — Spend vs Revenue, Category distribution, Brand ROAS, Regional revenue
- **Real-time filtering** by Brand, Platform, Category, Region
- **Three.js particle background** with mouse parallax
- **Modern navbar** with hover animations and glassmorphism
- **Dark theme** with purple/cyan accent colors
- **REST API** with filtering, sorting, and aggregation endpoints

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Recharts, Three.js, Lucide Icons |
| Backend | Node.js, Express |
| Data | Python (standard library) |

## Project Structure

```
cosmetics-dashboard/
├── data-generator/       # Python data generation script
│   ├── generate_data.py
│   └── venv/
├── backend/              # Express API server
│   ├── server.js
│   └── data/
│       └── cosmetics_ads.csv
└── frontend/             # React dashboard
    ├── src/
    │   ├── components/
    │   │   ├── Dashboard.jsx
    │   │   ├── Navbar.jsx
    │   │   ├── ParticleBackground.jsx
    │   │   ├── StatsGrid.jsx
    │   │   ├── ChartsGrid.jsx
    │   │   ├── FiltersSection.jsx
    │   │   └── DataTable.jsx
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Getting Started

### Prerequisites

- Python 3.8+
- Node.js 18+

### 1. Generate Data (already done)

```bash
cd data-generator
python -m venv venv
venv\Scripts\activate
python generate_data.py
```

### 2. Start Backend

```bash
cd backend
npm install
npm start
```

Server runs on http://localhost:3001

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard runs on http://localhost:3000

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/ads` | Get ads with filters, sorting, pagination |
| `GET /api/stats` | Summary statistics |
| `GET /api/aggregate/:dimension` | Aggregated data by dimension |
| `GET /api/filters` | Unique values for filter dropdowns |
| `GET /api/health` | Health check |

## Upload to GitHub

1. Create a new repository on GitHub
2. Run these commands in the project root:

```bash
git init
git add .
git commit -m "Initial commit - Cosmetics Ads Analytics Dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cosmetics-dashboard.git
git push -u origin main
```
