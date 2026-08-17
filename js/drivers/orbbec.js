/**
 * drivers/orbbec.js
 *
 * Orbbec Femto Mega — Simulated + Real drivers.
 *
 * DATA CONTRACT  (same shape from both drivers):
 * ─────────────────────────────────────────────
 * connect()  → { ok, info: { name, firmware, serial } }
 *
 * Events emitted during streaming:
 *   "frame"  → {
 *       frame_number, timestamp_us, timestamp_iso,
 *       depth:  { width, height, format, data_size_bytes, depth_scale_mm,
 *                 min_depth_mm, max_depth_mm, avg_depth_mm, fps,
 *                 pixels_uint16: Uint16Array | null },   ← null in sim
 *       color:  { width, height, format, data_size_bytes, fps,
 *                 pixels_rgb: Uint8Array | null },
 *       ir:     { width, height, format, data_size_bytes }
 *   }
 *
 * capturePointCloud() → {
 *       point_cloud_id, timestamp_iso, format, total_points, valid_points,
 *       unit, coordinate_system, bounding_box,
 *       points_xyz: Float32Array | null,   ← null in sim, real data in real
 *       sample_points: [{x,y,z},...],
 *       file_formats
 *   }
 *
 * captureIMU() → {
 *       imu_id, timestamp_iso,
 *       accelerometer: { x_g, y_g, z_g, unit, sample_rate_hz },
 *       gyroscope:     { x_dps, y_dps, z_dps, unit, sample_rate_hz },
 *       temperature_c
 *   }
 */

// ─── SIMULATED ────────────────────────────────────────────────────────────────

class OrbbecSimDriver extends DeviceDriver {

  constructor(cfg) {
    super(cfg);
    this._frameCount = 0;
    this._streamTimer = null;
  }

  async connect() {
    await delay(400);
    this.connected = true;
    return {
      ok: true,
      info: { name: "Femto Mega [SIM]", firmware: "1.2.8-sim", serial: "FM-SIM-001337" }
    };
  }

  async disconnect() {
    this.stopStream();
    this.connected = false;
  }

  startStream(intervalMs = 100) {
    this._streamTimer = setInterval(() => {
      this._frameCount++;
      const frame = this._buildFrame();
      this.emit("frame", frame);
    }, intervalMs);
  }

  stopStream() {
    if (this._streamTimer) { clearInterval(this._streamTimer); this._streamTimer = null; }
  }

  _buildFrame() {
    return {
      frame_number:  this._frameCount,
      timestamp_us:  Date.now() * 1000,
      timestamp_iso: nowISO(),
      depth: {
        width: 640, height: 576, format: "Y16",
        bytes_per_pixel: 2, data_size_bytes: 737280,
        depth_scale_mm: 1.0,
        min_depth_mm: rand(480, 540, 0),
        max_depth_mm: rand(3700, 3900, 0),
        avg_depth_mm: rand(1200, 1600, 0),
        fps: rand(28, 30, 1),
        pixels_uint16: null   // sim: no raw buffer
      },
      color: {
        width: 1920, height: 1080, format: "RGB888",
        bytes_per_pixel: 3, data_size_bytes: 6220800,
        fps: rand(28, 30, 1),
        pixels_rgb: null
      },
      ir: { width: 640, height: 576, format: "Y16", data_size_bytes: 737280 }
    };
  }

  async capturePointCloud() {
    await delay(400);
    const total = 307200;
    const valid = Math.floor(total * rand(0.7, 0.95, 3));
    return {
      point_cloud_id: `pc_${Date.now()}`,
      timestamp_iso:  nowISO(),
      format:         "XYZ_float32",
      total_points:   total,
      valid_points:   valid,
      unit:           "mm",
      coordinate_system: "camera_right_hand",
      bounding_box:   { x: [-500, 500], y: [-400, 400], z: [500, 3800] },
      points_xyz:     null,   // sim: no raw buffer
      sample_points:  Array.from({length:5}, () => ({
        x: rand(-400,400,1), y: rand(-300,300,1), z: rand(500,3500,1)
      })),
      file_formats: ["PLY", "PCD", "CSV"]
    };
  }

  async captureIMU() {
    await delay(150);
    return {
      imu_id:       `imu_${Date.now()}`,
      timestamp_iso: nowISO(),
      accelerometer: {
        x_g: rand(-0.05,0.05,4), y_g: rand(-0.05,0.05,4), z_g: rand(0.97,1.03,4),
        unit: "g", sample_rate_hz: 1600
      },
      gyroscope: {
        x_dps: rand(-0.5,0.5,3), y_dps: rand(-0.5,0.5,3), z_dps: rand(-0.5,0.5,3),
        unit: "deg/s", sample_rate_hz: 1600
      },
      temperature_c: rand(28, 35, 1)
    };
  }
}


// ─── REAL (WebSocket bridge to Python pyorbbecsdk) ────────────────────────────
//
// To use: run  python bridges/orbbec_bridge.py  on the same machine.
// The bridge calls pyorbbecsdk, serializes each frameset to JSON (without the
// raw pixel buffer by default — set SEND_PIXELS=1 env var for raw transfer),
// and pushes it over WebSocket at ws://localhost:8091/orbbec.

class OrbbecRealDriver extends DeviceDriver {

  constructor(cfg) {
    super(cfg);
    this._ws = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this.config.wsEndpoint);
      this._ws.onopen = () => {
        this._ws.send(JSON.stringify({
          cmd: "connect",
          transport: this.config.transport,
          ip:        this.config.ip,
          port:      this.config.port,
          depthMode: this.config.depthMode,
          colorRes:  this.config.colorRes,
          fps:       this.config.fps
        }));
      };
      this._ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === "connected") {
          this.connected = true;
          resolve({ ok: true, info: msg.info });
        } else if (msg.type === "frame") {
          this.emit("frame", msg.data);
        } else if (msg.type === "error") {
          reject(new Error(msg.message));
        }
      };
      this._ws.onerror = () => reject(new Error("WebSocket connection failed"));
    });
  }

  startStream() {
    if (this._ws) this._ws.send(JSON.stringify({ cmd: "start_stream" }));
  }

  stopStream() {
    if (this._ws) this._ws.send(JSON.stringify({ cmd: "stop_stream" }));
  }

  async capturePointCloud() {
    return this._request({ cmd: "capture_point_cloud" });
  }

  async captureIMU() {
    return this._request({ cmd: "capture_imu" });
  }

  async disconnect() {
    if (this._ws) { this._ws.send(JSON.stringify({cmd:"disconnect"})); this._ws.close(); }
    this.connected = false;
  }

  _request(msg) {
    return new Promise((resolve, reject) => {
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.type === msg.cmd + "_result") {
          this._ws.removeEventListener("message", handler);
          resolve(data.data);
        } else if (data.type === "error") {
          this._ws.removeEventListener("message", handler);
          reject(new Error(data.message));
        }
      };
      this._ws.addEventListener("message", handler);
      this._ws.send(JSON.stringify(msg));
    });
  }
}
