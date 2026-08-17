/**
 * WS bridge for the Vetscan VS2 / OptiCell — mirrors VetscanSimDriver,
 * speaking the exact cmd/type protocol VetscanRealDriver already expects
 * (including live "progress" events during runAnalysis).
 */
const { WebSocketServer } = require('ws');
const { rand, nowISO, delay } = require('./utils');

// Accepts a port number (standalone server) or the string 'shared', which
// returns a noServer-mode WebSocketServer for the caller to route manually
// via httpServer.on('upgrade', ...) — see orbbec.js for why this is needed
// instead of {server, path} when multiple bridges share one httpServer.
function start(portOrOpts) {
  const wss = portOrOpts === 'shared'
    ? new WebSocketServer({ noServer: true, perMessageDeflate: false })
    : new WebSocketServer({ port: portOrOpts, perMessageDeflate: false });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.cmd === 'connect') {
        ws.send(JSON.stringify({ type: 'connected', info: { model: 'Vetscan VS2 [SIM-BACKEND]', firmware: '2.8.1-sim', serial: 'VS2-SIM-20240556', state: 'Ready' } }));
      } else if (msg.cmd === 'get_status') {
        ws.send(JSON.stringify({ type: 'get_status_result', data: { device: 'VS2', state: 'Ready', temperature_c: rand(35, 37, 1), rotor_count: rand(45, 120, 0), last_qc: '2024-07-20T08:15:00Z', errors: [] } }));
      } else if (msg.cmd === 'run_analysis') {
        const { patient_id, rotor_type, sample_type, model = 'vs2' } = msg;
        for (let i = 1; i <= 20; i++) {
          await delay(120);
          ws.send(JSON.stringify({ type: 'progress', pct: Math.round(i / 20 * 100) }));
        }
        const isCBC = model === 'opticell';
        const analytes = isCBC ? [
          { name: 'WBC', value: rand(6, 16, 2), unit: '10³/µL', ref: [6.0, 17.0] },
          { name: 'RBC', value: rand(5.5, 8.5, 2), unit: '10⁶/µL', ref: [5.5, 8.5] },
          { name: 'Hemoglobin', value: rand(12, 18, 1), unit: 'g/dL', ref: [12, 18] },
          { name: 'Hematocrit', value: rand(37, 55, 1), unit: '%', ref: [37, 55] },
          { name: 'Platelets', value: rand(180, 400, 0), unit: '10³/µL', ref: [180, 400] },
          { name: 'Neutrophils', value: rand(3, 11, 2), unit: '10³/µL', ref: [3, 11.5] },
          { name: 'Lymphocytes', value: rand(1, 5, 2), unit: '10³/µL', ref: [1, 4.8] },
          { name: 'Monocytes', value: rand(0.2, 1.5, 2), unit: '10³/µL', ref: [0.2, 1.5] }
        ] : [
          { name: 'Glucose', value: rand(90, 120, 1), unit: 'mg/dL', ref: [70, 138] },
          { name: 'BUN', value: rand(15, 30, 1), unit: 'mg/dL', ref: [9, 29] },
          { name: 'Creatinine', value: rand(0.8, 1.5, 2), unit: 'mg/dL', ref: [0.5, 1.6] },
          { name: 'Calcium', value: rand(9, 11, 2), unit: 'mg/dL', ref: [9, 11.4] },
          { name: 'Total Protein', value: rand(5.5, 7.5, 2), unit: 'g/dL', ref: [5.4, 7.5] },
          { name: 'Albumin', value: rand(3, 4.2, 2), unit: 'g/dL', ref: [2.9, 4.2] },
          { name: 'ALT', value: rand(30, 90, 0), unit: 'U/L', ref: [18, 86] },
          { name: 'ALP', value: rand(40, 150, 0), unit: 'U/L', ref: [12, 122] },
          { name: 'Total Bilirubin', value: rand(0.1, 0.4, 2), unit: 'mg/dL', ref: [0.1, 0.5] },
          { name: 'Sodium', value: rand(142, 152, 1), unit: 'mmol/L', ref: [142, 152] },
          { name: 'Potassium', value: rand(3.8, 5.4, 2), unit: 'mmol/L', ref: [3.8, 5.4] },
          { name: 'Chloride', value: rand(105, 115, 1), unit: 'mmol/L', ref: [105, 115] }
        ];
        analytes.forEach(a => {
          a.flag = 'N';
          if (Math.random() > 0.82) {
            a.flag = Math.random() > 0.5 ? 'H' : 'L';
            if (a.flag === 'H') a.value = parseFloat((a.ref[1] + rand(0.1, a.ref[1] * 0.2, 2)).toFixed(2));
            if (a.flag === 'L') a.value = parseFloat(Math.max(0, a.ref[0] - rand(0.1, a.ref[0] * 0.15, 2)).toFixed(2));
          }
          a.reference_range = a.ref; delete a.ref;
        });
        const normal = analytes.filter(a => a.flag === 'N').length;
        ws.send(JSON.stringify({
          type: 'run_analysis_result',
          data: {
            run_id: `RUN-${Date.now()}`, timestamp_iso: nowISO(), device: isCBC ? 'Vetscan OptiCell' : 'Vetscan VS2',
            patient_id, rotor_type, sample_type, volume_ul: 2.0, status: 'completed', qc_passed: true,
            analytes, summary: { normal, abnormal: analytes.length - normal, total: analytes.length }
          }
        }));
      } else if (msg.cmd === 'disconnect') {
        ws.close();
      }
    });
  });

  return wss;
}

module.exports = { start };
