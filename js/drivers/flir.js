/**
 * drivers/flir.js
 *
 * FLIR A40 / A50 / A70 — Simulated + Real drivers.
 *
 * DATA CONTRACT  (same shape from both drivers):
 * ─────────────────────────────────────────────
 * connect()  → { ok, info: { model, firmware, serial, ip } }
 *
 * getImage(format)  → { format, width, height, size_bytes, timestamp_iso,
 *                        blob: Blob|null }   ← blob=null in sim
 *
 * getSpot(n, unit)  → { name, temperature, unit, x, y, timestamp }
 * getBox(n, unit)   → { name, max, min, avg, unit, area:{x,y,width,height}, timestamp }
 * getLine(n, unit)  → { name, max, min, avg, unit, points:[...], timestamp }
 * getAlarms()       → { alarms:[{ instance, name, state, triggered, threshold, unit, associatedROI }] }
 * getTempSensor(n, unit) → { instance, name, temperature, unit, timestamp }
 * getEnvironment()  → { ambient_temp_c, relative_humidity_pct, reflected_temp_c, emissivity, distance_m, timestamp }
 */

// ─── SIMULATED ────────────────────────────────────────────────────────────────

class FlirSimDriver extends DeviceDriver {

  async connect() {
    await delay(600);
    this.connected = true;
    return {
      ok: true,
      info: {
        model:    `FLIR ${document?.getElementById?.('model')?.value || 'A70'} [SIM]`,
        firmware: "2.3.1-sim",
        serial:   "A70-SIM-20240892",
        ip:       this.config.ip
      }
    };
  }

  async disconnect() { this.connected = false; }

  async getImage(format = "RJPEG") {
    await delay(300);
    const models = { A40:[320,240], A50:[464,348], A70:[640,480] };
    const [w, h] = models[document?.getElementById?.('model')?.value] || [640,480];
    return { format, width: w, height: h,
      size_bytes: rand(80000,130000,0), timestamp_iso: nowISO(), blob: null };
  }

  async getSpot(n, unit = "C") {
    await delay(200);
    return {
      name: `Spot${n}`, temperature: rand(36,42,2), unit,
      x: rand(100,500,0), y: rand(80,400,0), timestamp: nowISO()
    };
  }

  async getBox(n, unit = "C") {
    await delay(200);
    const mx = rand(39,43,2), mn = rand(33,36,2);
    return {
      name: `Box${n}`, max: mx, min: mn, avg: rand(mn,mx,2), unit,
      area: { x:rand(50,200,0), y:rand(50,200,0), width:rand(100,300,0), height:rand(100,200,0) },
      timestamp: nowISO()
    };
  }

  async getLine(n, unit = "C") {
    await delay(200);
    const pts = Array.from({length:20}, () => rand(35,42,2));
    return {
      name: `Line${n}`,
      max: Math.max(...pts), min: Math.min(...pts),
      avg: parseFloat((pts.reduce((a,b)=>a+b,0)/pts.length).toFixed(2)),
      unit, points: pts, timestamp: nowISO()
    };
  }

  async getAlarms() {
    await delay(200);
    const triggered = Math.random() > 0.7;
    return { alarms: [
      { instance:1, name:"High Temp Alert", state:triggered?"active":"inactive",
        triggered, threshold:41.0, unit:"C", associatedROI:"Box1" },
      { instance:2, name:"Low Temp Warning", state:"inactive",
        triggered:false, threshold:30.0, unit:"C", associatedROI:"Spot1" }
    ]};
  }

  async getTempSensor(n, unit = "C") {
    await delay(200);
    return { instance:parseInt(n), name:"Internal Housing Sensor",
      temperature:rand(28,35,2), unit, timestamp:nowISO() };
  }

  async getEnvironment() {
    await delay(150);
    return {
      ambient_temp_c: rand(18, 26, 1), relative_humidity_pct: rand(35, 65, 0),
      reflected_temp_c: rand(18, 26, 1), emissivity: rand(0.95, 0.98, 2),
      distance_m: rand(0.6, 1.2, 2), timestamp: nowISO()
    };
  }
}


// ─── REAL (direct HTTP to camera's REST API) ──────────────────────────────────
//
// The FLIR A-series cameras expose a REST API at http://{ip}/api directly on LAN.
// No bridge needed — the browser fetches the camera directly.
//
// CORS note: FLIR cameras don't set CORS headers. If your browser blocks the request,
// either:
//   a) Use a local CORS proxy:  npx local-cors-proxy --proxyUrl http://{camera_ip}
//   b) Run the sandbox from a local server on the same network segment
//   c) Use Chrome with --disable-web-security for testing only

class FlirRealDriver extends DeviceDriver {

  // config.ip is normally a bare LAN IP; if it already carries a protocol
  // (e.g. the deployed flir-sim Railway service, served over https) it's
  // used as a full base URL instead of assuming http://.
  get _base() {
    const ip = this.config.ip;
    return /^https?:\/\//.test(ip) ? `${ip}/api` : `http://${ip}/api`;
  }

  async connect() {
    // FLIR has no explicit handshake — we probe /tempsensor/1.json
    const r = await fetch(`${this._base}/tempsensor/1.json?tempUnit=${this.config.tempUnit}`);
    if (!r.ok) throw new Error(`Camera unreachable: ${r.status}`);
    this.connected = true;
    return {
      ok: true,
      info: { model:"FLIR A-series", firmware:"unknown", serial:"unknown", ip:this.config.ip }
    };
  }

  async disconnect() { this.connected = false; }

  async getImage(format = "RJPEG") {
    const r = await fetch(`${this._base}/image/current?imgformat=${format}`);
    if (!r.ok) throw new Error(`Image fetch failed: ${r.status}`);
    const blob = await r.blob();
    return { format, width: null, height: null, size_bytes: blob.size,
      timestamp_iso: nowISO(), blob };
  }

  async getSpot(n, unit = "C") {
    const r = await fetch(`${this._base}/spot/${n}.json?tempUnit=${unit}&pretty=true`);
    return r.json();
  }

  async getBox(n, unit = "C") {
    const r = await fetch(`${this._base}/box/${n}.json?tempUnit=${unit}`);
    return r.json();
  }

  async getLine(n, unit = "C") {
    const r = await fetch(`${this._base}/line/${n}.json?tempUnit=${unit}`);
    return r.json();
  }

  async getAlarms() {
    const r = await fetch(`${this._base}/alarms?pretty=true`);
    return r.json();
  }

  async getTempSensor(n, unit = "C") {
    const r = await fetch(`${this._base}/tempsensor/${n}.json?tempUnit=${unit}`);
    return r.json();
  }

  async getEnvironment() {
    const r = await fetch(`${this._base}/environment.json`);
    return r.json();
  }
}
