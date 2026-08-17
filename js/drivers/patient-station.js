/**
 * drivers/patient-station.js  — Patient Intake Station
 *
 * Hardware: RFID scanner (optional) + microchip reader (USB-HID) +
 *           weight scale (serial) + Body Condition Score camera.
 *
 * DATA CONTRACT (same shape from both drivers):
 * connect()        → { ok, info:{ station, rfid_reader, scale, bcs_camera } }
 * scanMicrochip()  → { chip_id, standard, found_in_registry, patient_match }
 * readWeight()     → { weight_kg, stable, timestamp_iso }
 * captureBodyPhoto()→ { image_id, width, height, timestamp_iso, blob:null }
 */

class PatientStationSimDriver extends DeviceDriver {

  async connect() {
    await delay(350);
    this.connected = true;
    return {
      ok: true,
      info: {
        station:     "Patient Station [SIM]",
        rfid_reader: "USB-HID ISO 11784/11785 [SIM]",
        scale:       `Serial ${this.config.scalePort || "COM7"} [SIM]`,
        bcs_camera:  "USB3 Vision [SIM]"
      }
    };
  }

  async disconnect() { this.connected = false; }

  async scanMicrochip() {
    await delay(500);
    const chipId = Array.from({length:15}, () => Math.floor(Math.random()*10)).join('');
    return {
      chip_id: chipId,
      standard: "ISO 11784/11785",
      found_in_registry: Math.random() > 0.3,
      patient_match: Math.random() > 0.5
    };
  }

  async readWeight() {
    await delay(700);
    return {
      weight_kg: rand(2.5, 45, 1),
      stable: true,
      timestamp_iso: nowISO()
    };
  }

  async captureBodyPhoto() {
    await delay(450);
    return {
      image_id: `bcs_${Date.now()}`,
      width: 1920, height: 1080,
      timestamp_iso: nowISO(),
      blob: null
    };
  }
}


// ─── REAL (WebSocket bridge to USB-HID microchip reader + serial scale) ──────
//
// Run a local bridge exposing RFID/microchip reads, scale weight polling,
// and BCS camera capture over WebSocket at ws://localhost:8097/patient.

class PatientStationRealDriver extends DeviceDriver {
  constructor(cfg) { super(cfg); this._ws = null; }

  async connect() {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this.config.wsEndpoint);
      this._ws.onopen = () => this._ws.send(JSON.stringify({
        cmd: "connect", scalePort: this.config.scalePort, rfidPort: this.config.rfidPort
      }));
      this._ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === "connected") { this.connected = true; resolve({ ok: true, info: msg.info }); }
        else if (msg.type === "error") reject(new Error(msg.message));
      };
      this._ws.onerror = () => reject(new Error("WS failed"));
    });
  }

  async scanMicrochip()    { return this._req({ cmd: "scan_microchip" }); }
  async readWeight()       { return this._req({ cmd: "read_weight" }); }
  async captureBodyPhoto() { return this._req({ cmd: "capture_bcs_photo" }); }

  async disconnect() {
    this._ws?.send(JSON.stringify({ cmd: "disconnect" }));
    this._ws?.close();
    this.connected = false;
  }

  _req(msg) {
    return new Promise((res, rej) => {
      const h = (evt) => {
        const d = JSON.parse(evt.data);
        if (d.type === msg.cmd + "_result") { this._ws.removeEventListener("message", h); res(d.data); }
        else if (d.type === "error")        { this._ws.removeEventListener("message", h); rej(new Error(d.message)); }
      };
      this._ws.addEventListener("message", h);
      this._ws.send(JSON.stringify(msg));
    });
  }
}
