/**
 * WS bridge for the Patient Station (microchip / scale / BCS camera) —
 * mirrors PatientStationSimDriver, speaking the exact cmd/type protocol
 * PatientStationRealDriver already expects.
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
        ws.send(JSON.stringify({
          type: 'connected',
          info: {
            station: 'Patient Station [SIM-BACKEND]',
            rfid_reader: 'USB-HID ISO 11784/11785 [SIM]',
            scale: `Serial ${msg.scalePort || 'COM7'} [SIM]`,
            bcs_camera: 'USB3 Vision [SIM]'
          }
        }));
      } else if (msg.cmd === 'scan_microchip') {
        await delay(300);
        const chipId = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
        ws.send(JSON.stringify({ type: 'scan_microchip_result', data: { chip_id: chipId, standard: 'ISO 11784/11785', found_in_registry: Math.random() > 0.3, patient_match: Math.random() > 0.5 } }));
      } else if (msg.cmd === 'read_weight') {
        await delay(400);
        ws.send(JSON.stringify({ type: 'read_weight_result', data: { weight_kg: rand(2.5, 45, 1), stable: true, timestamp_iso: nowISO() } }));
      } else if (msg.cmd === 'capture_bcs_photo') {
        await delay(250);
        ws.send(JSON.stringify({ type: 'capture_bcs_photo_result', data: { image_id: `bcs_${Date.now()}`, width: 1920, height: 1080, timestamp_iso: nowISO(), blob: null } }));
      } else if (msg.cmd === 'disconnect') {
        ws.close();
      }
    });
  });

  return wss;
}

module.exports = { start };
