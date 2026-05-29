import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { fetchAllSheets, isConfigured } from './sheets.js';
import { parseSheets } from './parser.js';
import { buildDataset } from './build.js';
import { loadScoringConfig } from './scoring.js';
import { getSampleParsed } from './sample-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3001;
const CACHE_TTL = (Number(process.env.CACHE_TTL_SECONDS) || 120) * 1000;

const app = express();
app.use(express.json());

// --- Optionaler Basic-Auth-Schutz -------------------------------------------
const AUTH_USER = process.env.DASHBOARD_USER;
const AUTH_PASS = process.env.DASHBOARD_PASSWORD;
if (AUTH_USER && AUTH_PASS) {
  app.use((req, res, next) => {
    // Health-Check muss ohne Login erreichbar sein (Render/Hoster prüfen ihn
    // ohne Zugangsdaten – sonst schlägt das Deployment fehl).
    if (req.path === '/api/health') return next();
    const hdr = req.headers.authorization || '';
    const [scheme, encoded] = hdr.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
      if (u === AUTH_USER && p === AUTH_PASS) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="MMV Dashboard"');
    return res.status(401).send('Authentifizierung erforderlich.');
  });
}

// --- Daten-Cache ------------------------------------------------------------
let cache = { at: 0, payload: null };

async function loadDataset({ refresh = false } = {}) {
  if (!refresh && cache.payload && Date.now() - cache.at < CACHE_TTL) {
    return cache.payload;
  }
  const cfg = loadScoringConfig();
  let parsed;
  let source;
  if (isConfigured()) {
    const sheets = await fetchAllSheets();
    parsed = parseSheets(sheets);
    source = 'google';
  } else {
    parsed = getSampleParsed();
    source = 'demo';
  }
  const dataset = buildDataset(parsed, cfg);
  const payload = {
    source,
    fetchedAt: new Date().toISOString(),
    scoring: { weights: cfg.weights, tiers: cfg.tiers },
    ...dataset,
  };
  cache = { at: Date.now(), payload };
  return payload;
}

// --- API --------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: isConfigured(), mode: isConfigured() ? 'google' : 'demo' });
});

app.get('/api/data', async (req, res) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const payload = await loadDataset({ refresh });
    res.json(payload);
  } catch (err) {
    console.error('Fehler beim Laden der Daten:', err);
    res.status(500).json({ error: err.message, hint: 'Prüfe Service-Account & Freigabe des Sheets (siehe README).' });
  }
});

// --- Statisches Frontend (Production-Build) ---------------------------------
const distDir = path.join(ROOT, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res
      .type('html')
      .send('<h1>MMV Dashboard – API läuft</h1><p>Frontend noch nicht gebaut. Im Dev: <code>npm run dev</code> und <a href="http://localhost:5173">localhost:5173</a> öffnen. Für Production: <code>npm run serve</code>.</p>')
  );
}

app.listen(PORT, () => {
  const mode = isConfigured() ? 'Google Sheets (live)' : 'DEMO (synthetische Daten)';
  console.log(`\n  MMV Dashboard-Server läuft auf  http://localhost:${PORT}`);
  console.log(`  Datenquelle: ${mode}\n`);
});
