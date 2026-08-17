/**
 * WS bridge for the Bionet VEMO ECG — mirrors VemoSimDriver, speaking the
 * exact cmd/type protocol VemoRealDriver already expects.
 */
const { WebSocketServer } = require('ws');
const { rand, nowISO, delay } = require('./utils');

function ecgSample(t, hr, lead) {
  const period = 60 / hr, tp = ((t % period) + period) % period, tn = tp / period;
  let v = 0;
  if (tn < 0.10) v = 0.15 * Math.sin(tn / 0.10 * Math.PI);
  else if (tn < 0.14) v = -0.10;
  else if (tn < 0.15) v = 1.00;
  else if (tn < 0.17) v = -0.25;
  else if (tn < 0.20) v = 0;
  else if (tn < 0.35) v = 0.25 * Math.sin((tn - 0.20) / 0.15 * Math.PI);
  const flip = lead === 'aVR' ? -1 : 1;
  return v * flip * (0.8 + Math.random() * 0.04);
}

// Accepts a port number (standalone server) or the string 'shared', which
// returns a noServer-mode WebSocketServer for the caller to route manually
// via httpServer.on('upgrade', ...) — see orbbec.js for why this is needed
// instead of {server, path} when multiple bridges share one httpServer.
function start(portOrOpts) {
  const wss = portOrOpts === 'shared'
    ? new WebSocketServer({ noServer: true, perMessageDeflate: false })
    : new WebSocketServer({ port: portOrOpts, perMessageDeflate: false });

  wss.on('connection', (ws) => {
    let t = 0, hr = 75, sr = 500, timer = null;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.cmd === 'connect') {
        ws.send(JSON.stringify({ type: 'connected', info: { model: 'BIONET VEMO [SIM-BACKEND]', firmware: '3.1.0-sim', serial: 'VM-SIM-004421' } }));
      } else if (msg.cmd === 'start_ecg') {
        sr = msg.sr || 500;
        const leads = msg.leads || 6;
        clearInterval(timer);
        const intervalMs = 1000 / (sr / 25);
        timer = setInterval(() => {
          t += 25 / sr;
          for (const lead of ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'].slice(0, leads)) {
            const samples = Array.from({ length: 25 }, (_, i) => parseFloat(ecgSample(t - (24 - i) / sr, hr, lead).toFixed(4)));
            ws.send(JSON.stringify({ type: 'packet', data: { timestamp_ms: Date.now(), lead, samples_mv: samples, sample_rate_hz: sr } }));
          }
        }, intervalMs);
      } else if (msg.cmd === 'stop_ecg') {
        clearInterval(timer); timer = null;
      } else if (msg.cmd === 'capture_record') {
        const duration_s = msg.duration_s || 10;
        await delay(duration_s * 80);
        const finalHr = Math.round(hr + rand(-2, 2, 0));
        ws.send(JSON.stringify({
          type: 'capture_record_result',
          data: {
            record_id: `VEMO-SIM-${Date.now()}`, timestamp_iso: nowISO(), duration_s, sample_rate_hz: sr,
            leads_captured: ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'],
            measurements: {
              heart_rate_bpm: finalHr, pr_interval_ms: rand(80, 200, 0), qrs_duration_ms: rand(40, 80, 0),
              qt_interval_ms: rand(200, 400, 0), qtc_interval_ms: rand(220, 440, 0), st_deviation_mv: rand(-0.1, 0.1, 3),
              p_axis_deg: rand(0, 90, 1), qrs_axis_deg: rand(-30, 90, 1)
            },
            interpretation: { rhythm: 'Normal Sinus Rhythm', abnormalities: [], confidence: 0.96 },
            hl7_aecg_xml: `<?xml version="1.0"?><AnnotatedECG xmlns="urn:hl7-org:v3"><!-- HR=${finalHr} --></AnnotatedECG>`
          }
        }));
      } else if (msg.cmd === 'capture_vitals') {
        await delay(600);
        const systolic = rand(105, 165, 0);
        const diastolic = rand(55, 100, 0);
        ws.send(JSON.stringify({
          type: 'capture_vitals_result',
          data: {
            vitals_id: `VIT-SIM-${Date.now()}`, timestamp_iso: nowISO(),
            pulse_oximetry: { spo2_pct: rand(93, 99, 0), pulse_rate_bpm: Math.round(hr + rand(-3, 3, 0)), perfusion_index_pct: rand(0.5, 8, 1) },
            non_invasive_bp: { systolic_mmhg: systolic, diastolic_mmhg: diastolic, map_mmhg: Math.round(diastolic + (systolic - diastolic) / 3), method: 'oscillometric' }
          }
        }));
      } else if (msg.cmd === 'disconnect') {
        clearInterval(timer); ws.close();
      }
    });

    ws.on('close', () => clearInterval(timer));
  });

  return wss;
}

module.exports = { start };
