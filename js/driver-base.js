/**
 * vet-device-sandbox / js / driver-base.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURATION  ←  THE ONLY THING YOU CHANGE TO GO REAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Set USE_REAL_DEVICE = true, fill in the connection params for your device,
 * and the same UI/data flow runs against live hardware.
 *
 * Each device has its own config block. The rest of the code never changes.
 *
 * Don't have hardware yet, but want to prove the network path actually
 * works instead of everything simulating in-browser? Run the included
 * backend (`cd server && npm install && npm start`) — it speaks the exact
 * WebSocket/REST protocol below over real sockets, just with simulated data
 * on the other end. Set USE_REAL_DEVICE = true and flir.ip below to
 * "localhost:8098" and every driver call becomes a genuine round trip.
 * When real hardware arrives, only server/lib/*.js need to change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * True when this page is being served from the deployed Railway `web`
 * service rather than opened locally (file://, localhost, 127.0.0.1). Lets
 * DeviceConfig point at the deployed hardware-bridge services automatically
 * instead of requiring a manual edit per environment.
 */
const IS_DEPLOYED = typeof location !== "undefined"
  && !["localhost", "127.0.0.1", ""].includes(location.hostname);

// Every hardware-bridge simulator is consolidated into the one deployed
// Railway service (see server/services/web.js), path-routed off whatever
// domain actually served this page — the service has more than one public
// domain attached, so this must not be hardcoded to just one of them.
const DEPLOYED_ORIGIN = IS_DEPLOYED ? location.host : "";

const DeviceConfig = {

  /** Master switch. false = simulated, true = real hardware (or, when
   *  deployed, the Railway-hosted simulator backend over a real network). */
  USE_REAL_DEVICE: IS_DEPLOYED,

  /** ── Orbbec Femto Mega ─────────────────────────────── */
  orbbec: {
    transport:  "ethernet",   // "ethernet" | "usb"
    ip:         "192.168.1.100",
    port:       8090,
    wsEndpoint: IS_DEPLOYED
      ? `wss://${DEPLOYED_ORIGIN}/orbbec`
      : "ws://localhost:8091/orbbec",  // local Python WS bridge
    depthMode:  "NFOV_UNBINNED",
    colorRes:   "1080P",
    fps:        30
  },

  /** ── FLIR A40 / A50 / A70 ─────────────────────────── */
  flir: {
    // Real camera's LAN IP normally goes here; js/drivers/flir.js treats a
    // value that already starts with http(s):// as a full base URL instead.
    ip: IS_DEPLOYED ? `https://${DEPLOYED_ORIGIN}` : "192.168.0.100",
    tempUnit: "C"
  },

  /** ── Clarius C7 Vet HD3 ────────────────────────────── */
  clarius: {
    probeIp:   "192.168.1.1",
    castPort:  5828,
    wsEndpoint: IS_DEPLOYED
      ? `wss://${DEPLOYED_ORIGIN}/clarius`
      : "ws://localhost:8092/clarius",  // local Python Cast→WS bridge
    imgWidth:  640,
    imgHeight: 480
  },

  /** ── Bionet VEMO ────────────────────────────────────── */
  vemo: {
    host:      "192.168.1.50",
    port:      3000,
    wsEndpoint: IS_DEPLOYED
      ? `wss://${DEPLOYED_ORIGIN}/vemo`
      : "ws://localhost:8093/vemo",     // serial-to-WS bridge
    sampleRate:500,
    leads:     6
  },

  /** ── Tekscan Animal Strideway ──────────────────────── */
  tekscan: {
    wsEndpoint: IS_DEPLOYED
      ? `wss://${DEPLOYED_ORIGIN}/tekscan`
      : "ws://localhost:8094/tekscan",  // COM SDK → WS bridge
    rows:      48,
    cols:      64,
    frameRate: 100
  },

  /** ── Vetscan VS2 / OptiCell ────────────────────────── */
  vetscan: {
    wsEndpoint: IS_DEPLOYED
      ? `wss://${DEPLOYED_ORIGIN}/vetscan`
      : "ws://localhost:8095/vetscan",  // serial-to-WS bridge
    // or REST middleware:
    restEndpoint: "http://localhost:8096/api/vetscan"
  },

  /** ── Patient Station (RFID / microchip / scale / BCS camera) ── */
  patientStation: {
    wsEndpoint: IS_DEPLOYED
      ? `wss://${DEPLOYED_ORIGIN}/patient`
      : "ws://localhost:8097/patient", // USB HID + serial → WS bridge
    scalePort:  "COM7",                        // serial, weight scale
    rfidPort:   "USB-HID"                       // RFID / microchip reader
  }
};


/**
 * Abstract base class for all device drivers.
 *
 * Every driver (simulated or real) MUST implement these methods.
 * The UI only ever calls methods on the driver — it never contains
 * simulation logic or hardware-specific code.
 *
 * Data contract: each method returns the SAME shape whether simulated or real.
 * The comments below show the exact JSON shape each method must return.
 */
class DeviceDriver {

  constructor(config) {
    this.config    = config;
    this.connected = false;
    this._listeners = {};
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Connect to device. Resolves with { ok:true, info:{name,firmware,serial} } */
  async connect()    { throw new Error("not implemented"); }

  /** Disconnect cleanly. */
  async disconnect() { throw new Error("not implemented"); }


  // ── Event emitter (used by streaming drivers) ──────────────────────────────

  on(event, cb)  { (this._listeners[event] = this._listeners[event]||[]).push(cb); }
  off(event, cb) { this._listeners[event] = (this._listeners[event]||[]).filter(f=>f!==cb); }
  emit(event, data) { (this._listeners[event]||[]).forEach(f => f(data)); }
}


/**
 * Factory: returns the correct driver for a given device key.
 *
 * Usage (inside each device HTML):
 *   const driver = DriverFactory.get("flir");
 *   await driver.connect();
 */
class DriverFactory {
  static get(deviceKey) {
    const cfg = DeviceConfig[deviceKey];
    if (!cfg) throw new Error(`Unknown device key: ${deviceKey}`);

    const useReal = DeviceConfig.USE_REAL_DEVICE;

    switch (deviceKey) {
      case "orbbec":   return useReal ? new OrbbecRealDriver(cfg)   : new OrbbecSimDriver(cfg);
      case "flir":     return useReal ? new FlirRealDriver(cfg)     : new FlirSimDriver(cfg);
      case "clarius":  return useReal ? new ClariusRealDriver(cfg)  : new ClariusSimDriver(cfg);
      case "vemo":     return useReal ? new VemoRealDriver(cfg)     : new VemoSimDriver(cfg);
      case "tekscan":  return useReal ? new TekscanRealDriver(cfg)  : new TekscanSimDriver(cfg);
      case "vetscan":  return useReal ? new VetscanRealDriver(cfg)  : new VetscanSimDriver(cfg);
      case "patientStation": return useReal ? new PatientStationRealDriver(cfg) : new PatientStationSimDriver(cfg);
      default: throw new Error(`No driver for: ${deviceKey}`);
    }
  }
}
