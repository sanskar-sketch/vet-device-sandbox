/**
 * Vitarus backend — local single-command dev entry point that runs every
 * service in one process (static/API + FLIR sim + all 6 WS bridges).
 *
 * In production (Railway) each service in server/services/*.js is deployed
 * separately instead — see server/services/README or .railway/railway.ts.
 */
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const orbbec = require('./lib/orbbec');
const clarius = require('./lib/clarius');
const vemo = require('./lib/vemo');
const tekscan = require('./lib/tekscan');
const vetscan = require('./lib/vetscan');
const patientStation = require('./lib/patient-station');
const flir = require('./lib/flir');
const aiNarrative = require('./lib/ai-narrative');
const auth = require('./lib/auth');
const petsApi = require('./lib/pets-api');
const examsApi = require('./lib/exams-api');
const labsApi = require('./lib/labs-api');

const STATIC_PORT = process.env.PORT || 4173;
const FLIR_PORT = process.env.FLIR_PORT || 8098;

async function main() {
  await db.ready;

  // ── Static frontend + the API (same origin so the browser can call it
  // with a plain same-origin fetch, no CORS needed) ─────────────────────────
  const staticApp = express();
  staticApp.use(express.json({ limit: '1mb' }));
  staticApp.use(session({
    secret: process.env.SESSION_SECRET || 'vitarus-dev-secret-not-for-production',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
  }));
  staticApp.use(auth.attachUser(db));
  staticApp.use('/api/auth', auth.router(db));
  staticApp.use('/api', petsApi.router(db));
  staticApp.use('/api', examsApi.router(db));
  staticApp.use('/api', labsApi.router(db));
  staticApp.use('/api', aiNarrative.router());
  staticApp.use(express.static(path.join(__dirname, '..')));
  staticApp.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal server error' });
  });
  staticApp.listen(STATIC_PORT, () => {
    console.log(`Vitarus frontend   → http://localhost:${STATIC_PORT}`);
    console.log(process.env.ANTHROPIC_API_KEY
      ? 'AI narrative       → enabled (ANTHROPIC_API_KEY set)'
      : 'AI narrative       → disabled (set ANTHROPIC_API_KEY to enable)');
  });

  // ── FLIR — REST-native camera, no bridge needed for real hardware either ──
  const flirApp = express();
  flirApp.use(cors());
  flirApp.use('/api', flir.router());
  flirApp.listen(FLIR_PORT, () => console.log(`FLIR REST sim      → http://localhost:${FLIR_PORT}/api`));

  // ── WebSocket bridges — one per device, matching js/driver-base.js ────────
  orbbec.start(8091);         console.log('Orbbec WS bridge   → ws://localhost:8091/orbbec');
  clarius.start(8092);        console.log('Clarius WS bridge  → ws://localhost:8092/clarius');
  vemo.start(8093);           console.log('VEMO WS bridge     → ws://localhost:8093/vemo');
  tekscan.start(8094);        console.log('Tekscan WS bridge  → ws://localhost:8094/tekscan');
  vetscan.start(8095);        console.log('Vetscan WS bridge  → ws://localhost:8095/vetscan');
  patientStation.start(8097); console.log('Patient WS bridge  → ws://localhost:8097/patient');

  console.log('\nAll bridges are running simulated data — set DeviceConfig.USE_REAL_DEVICE = true');
  console.log('and DeviceConfig.flir.ip = "localhost:8098" in js/driver-base.js to use them.');
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
