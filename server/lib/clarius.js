/**
 * WS bridge for the Clarius C7 Vet HD3 — mirrors ClariusSimDriver, speaking
 * the exact cmd/type protocol ClariusRealDriver already expects.
 */
const { WebSocketServer } = require('ws');
const { rand, nowISO } = require('./utils');

// Accepts a port number (standalone server) or the string 'shared', which
// returns a noServer-mode WebSocketServer for the caller to route manually
// via httpServer.on('upgrade', ...) — see orbbec.js for why this is needed
// instead of {server, path} when multiple bridges share one httpServer.
function start(portOrOpts) {
  const wss = portOrOpts === 'shared'
    ? new WebSocketServer({ noServer: true, perMessageDeflate: false })
    : new WebSocketServer({ port: portOrOpts, perMessageDeflate: false });

  wss.on('connection', (ws) => {
    let frame = 0, depth = 8, gain = 50, mode = 'bmode', frozen = false, timer = null;

    function buildFrame() {
      frame++;
      return {
        frame_number: frame, timestamp_us: Date.now() * 1000, timestamp_iso: nowISO(),
        width: 640, height: 480, bits_per_pixel: 8, data_size_bytes: 640 * 480,
        imaging_mode: mode, depth_cm: depth, gain_pct: gain, pixels_uint8: null,
        imu: {
          timestamp_us: Date.now() * 1000,
          accel: { x: rand(-0.05, 0.05, 4), y: rand(-0.05, 0.05, 4), z: rand(0.97, 1.03, 4) },
          gyro: { x: rand(-0.3, 0.3, 3), y: rand(-0.3, 0.3, 3), z: rand(-0.3, 0.3, 3) }
        }
      };
    }

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.cmd === 'connect') {
        ws.send(JSON.stringify({ type: 'connected', info: { model: 'C7 Vet HD3 [SIM-BACKEND]', firmware: '12.2.4-sim', serial: 'CL-SIM-009981', elements: 192 } }));
      } else if (msg.cmd === 'start_stream') {
        depth = msg.depth || depth; gain = msg.gain || gain; mode = msg.mode || mode;
        clearInterval(timer);
        timer = setInterval(() => { if (!frozen) ws.send(JSON.stringify({ type: 'frame', data: buildFrame() })); }, 40);
      } else if (msg.cmd === 'stop_stream') {
        clearInterval(timer); timer = null;
      } else if (msg.cmd === 'set_depth') {
        depth = msg.value;
      } else if (msg.cmd === 'set_gain') {
        gain = msg.value;
      } else if (msg.cmd === 'freeze') {
        frozen = msg.state; ws.send(JSON.stringify({ type: 'freeze', frozen }));
      } else if (msg.cmd === 'capture_raw_iq') {
        const lines = 128, samples = 1024;
        ws.send(JSON.stringify({
          type: 'capture_raw_iq_result',
          data: {
            lines, samples_per_line: samples, data_size_bytes: lines * samples * 2 * 4,
            lateral_spacing_mm: rand(0.18, 0.22, 4), axial_spacing_mm: rand(0.045, 0.055, 4),
            center_frequency_mhz: rand(6.5, 8.5, 2), sample_rate_mhz: rand(40, 60, 1),
            depth_start_mm: 0, depth_end_mm: depth * 10, iq_data: null
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
