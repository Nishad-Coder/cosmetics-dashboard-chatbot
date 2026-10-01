const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const chatbot = require('./chatbot-client');

app.use(cors());
app.use(express.json());

// Read and parse CSV
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            const value = values[index] || '';
            if (!isNaN(value) && value !== '') {
                row[header] = parseFloat(value);
            } else {
                row[header] = value;
            }
        });
        
        // Calculate derived metrics
        row.ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
        row.roas = row.spend_inr > 0 ? row.revenue_inr / row.spend_inr : 0;
        row.cpa = row.purchases > 0 ? row.spend_inr / row.purchases : 0;
        row.cpm = row.impressions > 0 ? (row.spend_inr / row.impressions) * 1000 : 0;
        row.cpc = row.clicks > 0 ? row.spend_inr / row.clicks : 0;
        
        return row;
    });
}

// Load data
const DATA_PATH = path.join(__dirname, 'data', 'ads_performance.csv');
let adData = [];

try {
    adData = parseCSV(DATA_PATH);
    console.log(`Loaded ${adData.length} records from CSV`);
} catch (error) {
    console.error('Error loading CSV:', error.message);
}

// API Routes

// Get all data with filtering
app.get('/api/ads', (req, res) => {
    try {
        const { campaign, objective, adset, start_date, end_date, limit = 1000, offset = 0 } = req.query;
        let filtered = [...adData];

        if (campaign) {
            const campaigns = campaign.split(',');
            filtered = filtered.filter(r => campaigns.includes(r.campaign));
        }
        if (objective) {
            const objectives = objective.split(',');
            filtered = filtered.filter(r => objectives.includes(r.objective));
        }
        if (adset) {
            const adsets = adset.split(',');
            filtered = filtered.filter(r => adsets.includes(r.adset));
        }
        if (start_date) {
            filtered = filtered.filter(r => r.date >= start_date);
        }
        if (end_date) {
            filtered = filtered.filter(r => r.date <= end_date);
        }

        const total = filtered.length;
        const paginated = filtered.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({ data: paginated, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get summary statistics
app.get('/api/stats', (req, res) => {
    try {
        const totalSpend = adData.reduce((sum, r) => sum + r.spend_inr, 0);
        const totalRevenue = adData.reduce((sum, r) => sum + r.revenue_inr, 0);
        const totalImpressions = adData.reduce((sum, r) => sum + r.impressions, 0);
        const totalClicks = adData.reduce((sum, r) => sum + r.clicks, 0);
        const totalPurchases = adData.reduce((sum, r) => sum + r.purchases, 0);

        const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const avgROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
        const avgCPA = totalPurchases > 0 ? totalSpend / totalPurchases : 0;

        res.json({
            total_records: adData.length,
            total_spend: Math.round(totalSpend * 100) / 100,
            total_revenue: Math.round(totalRevenue * 100) / 100,
            total_impressions: totalImpressions,
            total_clicks: totalClicks,
            total_purchases: totalPurchases,
            avg_ctr: Math.round(avgCTR * 100) / 100,
            avg_roas: Math.round(avgROAS * 100) / 100,
            avg_cpa: Math.round(avgCPA * 100) / 100,
            date_range: {
                start: adData.length > 0 ? adData[0].date : null,
                end: adData.length > 0 ? adData[adData.length - 1].date : null,
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get time-series data (daily aggregation)
app.get('/api/timeseries', (req, res) => {
    try {
        const { campaign, objective } = req.query;
        let filtered = [...adData];

        if (campaign) {
            const campaigns = campaign.split(',');
            filtered = filtered.filter(r => campaigns.includes(r.campaign));
        }
        if (objective) {
            const objectives = objective.split(',');
            filtered = filtered.filter(r => objectives.includes(r.objective));
        }

        // Group by date
        const daily = {};
        filtered.forEach(row => {
            if (!daily[row.date]) {
                daily[row.date] = {
                    date: row.date,
                    spend: 0,
                    revenue: 0,
                    impressions: 0,
                    clicks: 0,
                    purchases: 0,
                };
            }
            daily[row.date].spend += row.spend_inr;
            daily[row.date].revenue += row.revenue_inr;
            daily[row.date].impressions += row.impressions;
            daily[row.date].clicks += row.clicks;
            daily[row.date].purchases += row.purchases;
        });

        // Calculate derived metrics and sort by date
        const result = Object.values(daily)
            .map(d => ({
                ...d,
                ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
                roas: d.spend > 0 ? d.revenue / d.spend : 0,
                cpa: d.purchases > 0 ? d.spend / d.purchases : 0,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get campaign-level aggregation
app.get('/api/campaigns', (req, res) => {
    try {
        const campaigns = {};

        adData.forEach(row => {
            if (!campaigns[row.campaign]) {
                campaigns[row.campaign] = {
                    campaign: row.campaign,
                    objective: row.objective,
                    spend: 0,
                    revenue: 0,
                    impressions: 0,
                    clicks: 0,
                    purchases: 0,
                    adsets: new Set(),
                };
            }
            campaigns[row.campaign].spend += row.spend_inr;
            campaigns[row.campaign].revenue += row.revenue_inr;
            campaigns[row.campaign].impressions += row.impressions;
            campaigns[row.campaign].clicks += row.clicks;
            campaigns[row.campaign].purchases += row.purchases;
            campaigns[row.campaign].adsets.add(row.adset);
        });

        const result = Object.values(campaigns).map(c => ({
            campaign: c.campaign,
            objective: c.objective,
            spend: Math.round(c.spend * 100) / 100,
            revenue: Math.round(c.revenue * 100) / 100,
            impressions: c.impressions,
            clicks: c.clicks,
            purchases: c.purchases,
            ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
            roas: c.spend > 0 ? c.revenue / c.spend : 0,
            cpa: c.purchases > 0 ? c.spend / c.purchases : 0,
            adset_count: c.adsets.size,
        }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get adset-level aggregation
app.get('/api/adsets', (req, res) => {
    try {
        const { campaign } = req.query;
        let filtered = [...adData];

        if (campaign) {
            filtered = filtered.filter(r => r.campaign === campaign);
        }

        const adsets = {};

        filtered.forEach(row => {
            const key = `${row.campaign}_${row.adset}`;
            if (!adsets[key]) {
                adsets[key] = {
                    adset: row.adset,
                    campaign: row.campaign,
                    spend: 0,
                    revenue: 0,
                    impressions: 0,
                    clicks: 0,
                    purchases: 0,
                };
            }
            adsets[key].spend += row.spend_inr;
            adsets[key].revenue += row.revenue_inr;
            adsets[key].impressions += row.impressions;
            adsets[key].clicks += row.clicks;
            adsets[key].purchases += row.purchases;
        });

        const result = Object.values(adsets).map(a => ({
            ...a,
            spend: Math.round(a.spend * 100) / 100,
            revenue: Math.round(a.revenue * 100) / 100,
            ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
            roas: a.spend > 0 ? a.revenue / a.spend : 0,
            cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
        }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get anomalies
app.get('/api/anomalies', (req, res) => {
    try {
        const anomaliesPath = path.join(__dirname, 'data', 'anomalies.json');
        const anomaliesData = JSON.parse(fs.readFileSync(anomaliesPath, 'utf-8'));
        res.json(anomaliesData.anomalies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get decisions
app.get('/api/decisions', (req, res) => {
    try {
        const decisionsPath = path.join(__dirname, 'data', 'decisions.json');
        const decisionsData = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));
        res.json(decisionsData.decisions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get unique values for filters
app.get('/api/filters', (req, res) => {
    try {
        const getUnique = (field) => [...new Set(adData.map(r => r[field]))].sort();
        
        res.json({
            campaigns: getUnique('campaign'),
            objectives: getUnique('objective'),
            adsets: getUnique('adset'),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', records: adData.length });
});

// ---------------------------------------------------------------
// Chatbot
//
// Numbers in chatbot answers are computed in Python (backend/chatbot/engine.py)
// directly from ads_performance.csv, not generated by a language model. The
// trained model supplies phrasing only. See backend/chatbot-client.js.
// ---------------------------------------------------------------

app.get('/api/chatbot/status', (req, res) => {
    res.json(chatbot.status());
});

app.get('/api/chatbot/suggestions', async (req, res) => {
    try {
        const r = await chatbot.suggestions();
        res.json({ suggestions: r.suggestions });
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

app.post('/api/chatbot/ask', async (req, res) => {
    const question = (req.body && req.body.question) || '';
    if (!question.trim()) {
        return res.status(400).json({ error: 'question is required' });
    }
    try {
        const r = await chatbot.answer(question);
        res.json({
            answer: r.answer,
            sources: r.sources || [],
            intents: r.intents || []
        });
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

chatbot.start();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Loaded ${adData.length} records`);
});
