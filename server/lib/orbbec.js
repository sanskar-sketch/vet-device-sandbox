/**
 * WS bridge for the Orbbec Femto Mega — mirrors OrbbecSimDriver's data
 * exactly, but delivered over a real WebSocket instead of in-browser,
 * using the same cmd/type contract OrbbecRealDriver already expects.
 */
const { WebSocketServer } = require('ws');
const { rand, nowISO } = require('./utils');

// Accepts a port number (standalone server) or the string 'shared', which
// returns a noServer-mode WebSocketServer for the caller to route manually
// via httpServer.on('upgrade', ...) — used when consolidating multiple WS
// bridges onto one Railway service. A ws.Server bound directly via
// {server, path} actively aborts (HTTP 400) any request that doesn't match
// its own path instead of deferring to other listeners, so multiple such
// servers can't share one httpServer; manual routing is required instead.
// perMessageDeflate is disabled — some proxies mangle the compressed frame
// bit, which otherwise surfaces as "Invalid WebSocket frame: RSV1 must be clear".
function start(portOrOpts) {
  const wss = portOrOpts === 'shared'
    ? new WebSocketServer({ noServer: true, perMessageDeflate: false })
    : new WebSocketServer({ port: portOrOpts, perMessageDeflate: false });

  wss.on('connection', (ws) => {
    let frameCount = 0;
    let streamTimer = null;

    function buildFrame() {
      frameCount++;
      return {
        frame_number: frameCount, timestamp_us: Date.now() * 1000, timestamp_iso: nowISO(),
        depth: {
          width: 640, height: 576, format: 'Y16', bytes_per_pixel: 2, data_size_bytes: 737280,
          depth_scale_mm: 1.0, min_depth_mm: rand(480, 540, 0), max_depth_mm: rand(3700, 3900, 0),
          avg_depth_mm: rand(1200, 1600, 0), fps: rand(28, 30, 1), pixels_uint16: null
        },
        color: {
          width: 1920, height: 1080, format: 'RGB888', bytes_per_pixel: 3, data_size_bytes: 6220800,
          fps: rand(28, 30, 1), pixels_rgb: null
        },
        ir: { width: 640, height: 576, format: 'Y16', data_size_bytes: 737280 }
      };
    }

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.cmd === 'connect') {
        ws.send(JSON.stringify({ type: 'connected', info: { name: 'Femto Mega [SIM-BACKEND]', firmware: '1.2.8-sim', serial: 'FM-SIM-001337' } }));
      } else if (msg.cmd === 'start_stream') {
        clearInterval(streamTimer);
        streamTimer = setInterval(() => ws.send(JSON.stringify({ type: 'frame', data: buildFrame() })), 100);
      } else if (msg.cmd === 'stop_stream') {
        clearInterval(streamTimer); streamTimer = null;
      } else if (msg.cmd === 'capture_point_cloud') {
        const total = 307200, valid = Math.floor(total * rand(0.7, 0.95, 3));
        ws.send(JSON.stringify({
          type: 'capture_point_cloud_result',
          data: {
            point_cloud_id: `pc_${Date.now()}`, timestamp_iso: nowISO(), format: 'XYZ_float32',
            total_points: total, valid_points: valid, unit: 'mm', coordinate_system: 'camera_right_hand',
            bounding_box: { x: [-500, 500], y: [-400, 400], z: [500, 3800] }, points_xyz: null,
            sample_points: Array.from({ length: 5 }, () => ({ x: rand(-400, 400, 1), y: rand(-300, 300, 1), z: rand(500, 3500, 1) })),
            file_formats: ['PLY', 'PCD', 'CSV']
          }
        }));
      } else if (msg.cmd === 'capture_imu') {
        ws.send(JSON.stringify({
          type: 'capture_imu_result',
          data: {
            imu_id: `imu_${Date.now()}`, timestamp_iso: nowISO(),
            accelerometer: { x_g: rand(-0.05, 0.05, 4), y_g: rand(-0.05, 0.05, 4), z_g: rand(0.97, 1.03, 4), unit: 'g', sample_rate_hz: 1600 },
            gyroscope: { x_dps: rand(-0.5, 0.5, 3), y_dps: rand(-0.5, 0.5, 3), z_dps: rand(-0.5, 0.5, 3), unit: 'deg/s', sample_rate_hz: 1600 },
            temperature_c: rand(28, 35, 1)
          }
        }));
      } else if (msg.cmd === 'disconnect') {
        clearInterval(streamTimer); ws.close();
      }
    });

    ws.on('close', () => clearInterval(streamTimer));
  });

  return wss;
}

module.exports = { start };
