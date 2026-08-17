/**
 * WS bridge for the Tekscan Animal Strideway — mirrors TekscanSimDriver
 * (including the _simPhase field the frontend's live pressure-map renderer
 * reads directly), speaking the exact cmd/type protocol TekscanRealDriver
 * already expects.
 */
const { WebSocketServer } = require('ws');
const { nowISO } = require('./utils');

// Accepts a port number (standalone server) or the string 'shared', which
// returns a noServer-mode WebSocketServer for the caller to route manually
// via httpServer.on('upgrade', ...) — see orbbec.js for why this is needed
// instead of {server, path} when multiple bridges share one httpServer.
function start(portOrOpts) {
  const wss = portOrOpts === 'shared'
    ? new WebSocketServer({ noServer: true, perMessageDeflate: false })
    : new WebSocketServer({ port: portOrOpts, perMessageDeflate: false });

  wss.on('connection', (ws) => {
    let frameCount = 0, phase = 0, timer = null;
    const rows = 48, cols = 64, calib = 0.42;

    function buildFrame() {
      frameCount++; phase += 0.05;
      const cx = cols / 2 + Math.sin(phase) * cols * 0.15;
      const cy = rows / 2 + Math.cos(phase * 0.7) * rows * 0.1;
      const paws = [
        { x: cx - cols * 0.15, y: cy - rows * 0.2, r: cols * 0.07, a: 0.6 + 0.3 * Math.sin(phase) },
        { x: cx + cols * 0.15, y: cy - rows * 0.1, r: cols * 0.07, a: 0.5 + 0.4 * Math.cos(phase) },
        { x: cx - cols * 0.12, y: cy + rows * 0.18, r: cols * 0.07, a: 0.7 + 0.2 * Math.sin(phase + 1) },
        { x: cx + cols * 0.12, y: cy + rows * 0.2, r: cols * 0.07, a: 0.4 + 0.5 * Math.cos(phase + 2) }
      ];
      let peak = 0, total = 0, active = 0, copX = 0, copY = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        let v = 0;
        for (const p of paws) { const d = Math.sqrt((c - p.x) ** 2 + (r - p.y) ** 2); if (d < p.r) v += p.a * (1 - d / p.r) ** 2; }
        const f = Math.min(1, v) * 5 * calib;
        if (f > 0.01) { active++; total += f; copX += c * f; copY += r * f; }
        peak = Math.max(peak, f);
      }
      return {
        frame_id: `f_${frameCount}`, timestamp_ms: Date.now(), timestamp_iso: nowISO(),
        rows, cols, calibration_n_per_raw: calib,
        peak_force_N: parseFloat(peak.toFixed(3)), total_force_N: parseFloat(total.toFixed(3)),
        active_sensels: active, contact_area_cm2: parseFloat((active * 0.0154).toFixed(3)),
        center_of_pressure: total > 0
          ? { x_sensel: parseFloat((copX / total).toFixed(2)), y_sensel: parseFloat((copY / total).toFixed(2)) }
          : { x_sensel: 0, y_sensel: 0 },
        matrix_flat: null, _simPhase: phase
      };
    }

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.cmd === 'connect') {
        ws.send(JSON.stringify({ type: 'connected', info: { system: 'Animal Strideway [SIM-BACKEND]', rows, cols, frame_rate_hz: 100, calibration: calib } }));
      } else if (msg.cmd === 'start_acquisition') {
        clearInterval(timer);
        timer = setInterval(() => ws.send(JSON.stringify({ type: 'frame', data: buildFrame() })), 10);
      } else if (msg.cmd === 'stop_acquisition') {
        clearInterval(timer); timer = null;
      } else if (msg.cmd === 'export_xml') {
        ws.send(JSON.stringify({
          type: 'export_xml_result',
          data: `<?xml version="1.0"?><FScan version="9.0"><Session totalFrames="${frameCount}"><SensorConfig rows="${rows}" cols="${cols}" frameRate="100" calibration="${calib}" unit="N"/></Session></FScan>`
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
