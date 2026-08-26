/**
 * server/services/web.js
 *
 * The whole Vitarus backend as a single Railway service: static frontend +
 * REST API (auth, pets, exams, labs, AI narrative) + the FLIR REST sim +
 * every simulated-hardware WS bridge (orbbec/clarius/vemo/tekscan/vetscan/
 * patient-station), all path-routed on one HTTP server. Only this service
 * talks to Postgres.
 *
 * Everything is consolidated here rather than split into separate Railway
 * services — one process/service is simpler to run and deploy, and the
 * hardware bridges are pure simulators with no real device behind them, so
 * there's no isolation benefit to splitting them out.
 */
const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');

const db = require('../db');
const aiNarrative = require('../lib/ai-narrative');
const aiAssessment = require('../lib/ai-assessment');
const mediaAnalysis = require('../lib/media-analysis');
const auth = require('../lib/auth');
const petsApi = require('../lib/pets-api');
const examsApi = require('../lib/exams-api');
const labsApi = require('../lib/labs-api');
const appointmentsApi = require('../lib/appointments-api');
const flir = require('../lib/flir');
const orbbec = require('../lib/orbbec');
const clarius = require('../lib/clarius');
const vemo = require('../lib/vemo');
const tekscan = require('../lib/tekscan');
const vetscan = require('../lib/vetscan');
const patientStation = require('../lib/patient-station');

const PORT = process.env.PORT || 4173;

async function main() {
  await db.ready;

  const app = express();
  // Railway terminates TLS at its edge proxy and forwards to us over plain
  // HTTP — without this, Express can't see the connection as secure, so the
  // session cookie's `secure: true` flag silently drops it on every request.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'vitarus-dev-secret-not-for-production',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
  }));
  // Liveness/readiness probe for the hosting platform's load balancer —
  // confirms the process is up AND the database connection actually works,
  // not just that Express is listening.
  app.get('/health', async (req, res) => {
    try {
      await db.prepare('SELECT 1').get();
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(503).json({ status: 'error', message: err.message });
    }
  });

  app.use(auth.attachUser(db));
  app.use('/api/auth', auth.router(db));
  app.use('/api', petsApi.router(db));
  app.use('/api', examsApi.router(db));
  app.use('/api', labsApi.router(db));
  app.use('/api', appointmentsApi.router(db));
  app.use('/api', aiNarrative.router());
  app.use('/api', aiAssessment.router());
  app.use('/api', mediaAnalysis.router());
  app.use('/api', flir.router());
  app.use(express.static(path.join(__dirname, '..', '..')));

  // Final error handler — an async route/middleware rejection lands here
  // instead of hanging the request.
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal server error' });
  });

  const httpServer = http.createServer(app);

  // Consolidated WS bridges — share this HTTP server, routed by path. Each
  // bridge returns a noServer-mode WebSocketServer; we dispatch upgrades to
  // the right one ourselves rather than letting each bind {server, path}
  // directly (a ws.Server bound that way aborts any non-matching request
  // with HTTP 400 instead of deferring to the next listener, so multiple
  // of them can't share one httpServer without this manual routing).
  const wsRoutes = {
    '/orbbec':  orbbec.start('shared'),
    '/clarius': clarius.start('shared'),
    '/vemo':    vemo.start('shared'),
    '/tekscan': tekscan.start('shared'),
    '/vetscan': vetscan.start('shared'),
    '/patient': patientStation.start('shared'),
  };
  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    const wss = wsRoutes[pathname];
    if (!wss) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  httpServer.listen(PORT, () => {
    console.log(`Vitarus web        → http://localhost:${PORT}`);
    console.log(`FLIR REST sim      → http://localhost:${PORT}/api`);
    console.log(`Orbbec WS bridge   → ws://localhost:${PORT}/orbbec`);
    console.log(`Clarius WS bridge  → ws://localhost:${PORT}/clarius`);
    console.log(`VEMO WS bridge     → ws://localhost:${PORT}/vemo`);
    console.log(`Tekscan WS bridge  → ws://localhost:${PORT}/tekscan`);
    console.log(`Vetscan WS bridge  → ws://localhost:${PORT}/vetscan`);
    console.log(`Patient WS bridge  → ws://localhost:${PORT}/patient`);
    console.log(process.env.OPENAI_API_KEY
      ? 'AI narrative       → enabled (OPENAI_API_KEY set)'
      : 'AI narrative       → disabled (set OPENAI_API_KEY to enable)');
    console.log(process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM
      ? 'Email delivery     → enabled (SENDGRID_API_KEY + EMAIL_FROM set)'
      : 'Email delivery     → disabled (set SENDGRID_API_KEY + EMAIL_FROM to enable — reset links shown directly instead)');
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
