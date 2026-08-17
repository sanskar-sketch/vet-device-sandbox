/**
 * drivers/clarius.js
 *
 * Clarius C7 Vet HD3 — Simulated + Real drivers.
 *
 * DATA CONTRACT:
 * connect()  → { ok, info: { model, firmware, serial, elements } }
 *
 * Events (streaming):
 *   "frame"  → { frame_number, timestamp_us, timestamp_iso,
 *                width, height, bits_per_pixel, data_size_bytes,
 *                imaging_mode, depth_cm, gain_pct,
 *                pixels_uint8: Uint8Array|null,
 *                imu: { timestamp_us, accel:{x,y,z}, gyro:{x,y,z} } }
 *
 * captureRawIQ() → { lines, samples_per_line, data_size_bytes,
 *                    lateral_spacing_mm, axial_spacing_mm,
 *                    center_frequency_mhz, sample_rate_mhz,
 *                    depth_start_mm, depth_end_mm,
 *                    iq_data: Float32Array|null }
 *
 * setDepth(cm), setGain(pct), freeze(bool)
 */

class ClariusSimDriver extends DeviceDriver {
  constructor(cfg) { super(cfg); this._timer=null; this._frame=0; this._frozen=false; }

  async connect() {
    await delay(700);
    this.connected = true;
    return { ok:true, info:{ model:"C7 Vet HD3 [SIM]", firmware:"12.2.4-sim", serial:"CL-SIM-009981", elements:192 } };
  }

  async disconnect() { this.stopStream(); this.connected=false; }

  startStream(depth_cm=8, gain_pct=50, mode="bmode") {
    this._depth=depth_cm; this._gain=gain_pct; this._mode=mode;
    this._timer = setInterval(() => {
      if (!this._frozen) { this._frame++; this.emit("frame", this._buildFrame()); }
    }, 40);
  }

  stopStream() { if(this._timer){clearInterval(this._timer);this._timer=null;} }

  async setDepth(cm)  { this._depth=cm; }
  async setGain(pct)  { this._gain=pct; }
  async freeze(state) { this._frozen=state; this.emit("freeze",state); }

  _buildFrame() {
    const w=this.config.imgWidth||640, h=this.config.imgHeight||480;
    return {
      frame_number:this._frame, timestamp_us:Date.now()*1000, timestamp_iso:nowISO(),
      width:w, height:h, bits_per_pixel:8, data_size_bytes:w*h,
      imaging_mode:this._mode||"bmode", depth_cm:this._depth||8, gain_pct:this._gain||50,
      pixels_uint8:null,
      imu:{ timestamp_us:Date.now()*1000,
        accel:{x:rand(-0.05,0.05,4),y:rand(-0.05,0.05,4),z:rand(0.97,1.03,4)},
        gyro: {x:rand(-0.3,0.3,3), y:rand(-0.3,0.3,3), z:rand(-0.3,0.3,3)} }
    };
  }

  async captureRawIQ() {
    await delay(500);
    const lines=128, samples=1024;
    return {
      lines, samples_per_line:samples, data_size_bytes:lines*samples*2*4,
      lateral_spacing_mm:rand(0.18,0.22,4), axial_spacing_mm:rand(0.045,0.055,4),
      center_frequency_mhz:rand(6.5,8.5,2), sample_rate_mhz:rand(40,60,1),
      depth_start_mm:0, depth_end_mm:(this._depth||8)*10,
      iq_data:null
    };
  }
}

class ClariusRealDriver extends DeviceDriver {
  constructor(cfg) { super(cfg); this._ws=null; }

  async connect() {
    return new Promise((resolve,reject) => {
      this._ws = new WebSocket(this.config.wsEndpoint);
      this._ws.onopen = () => this._ws.send(JSON.stringify({
        cmd:"connect", ip:this.config.probeIp, port:this.config.castPort,
        width:this.config.imgWidth, height:this.config.imgHeight
      }));
      this._ws.onmessage = (evt) => {
        const msg=JSON.parse(evt.data);
        if(msg.type==="connected")  { this.connected=true; resolve({ok:true,info:msg.info}); }
        else if(msg.type==="frame") this.emit("frame",msg.data);
        else if(msg.type==="freeze")this.emit("freeze",msg.frozen);
        else if(msg.type==="error") reject(new Error(msg.message));
      };
      this._ws.onerror=()=>reject(new Error("WS failed"));
    });
  }

  startStream(depth,gain,mode) {
    this._ws.send(JSON.stringify({cmd:"start_stream",depth,gain,mode}));
  }
  stopStream()     { this._ws.send(JSON.stringify({cmd:"stop_stream"})); }
  async setDepth(cm)  { this._ws.send(JSON.stringify({cmd:"set_depth",value:cm})); }
  async setGain(pct)  { this._ws.send(JSON.stringify({cmd:"set_gain",value:pct})); }
  async freeze(state) { this._ws.send(JSON.stringify({cmd:"freeze",state})); }
  async captureRawIQ(){ return this._req({cmd:"capture_raw_iq"}); }
  async disconnect()  { this._ws?.send(JSON.stringify({cmd:"disconnect"})); this._ws?.close(); this.connected=false; }

  _req(msg) {
    return new Promise((res,rej)=>{
      const h=(evt)=>{ const d=JSON.parse(evt.data);
        if(d.type===msg.cmd+"_result"){this._ws.removeEventListener("message",h);res(d.data);}
        else if(d.type==="error"){this._ws.removeEventListener("message",h);rej(new Error(d.message));}
      };
      this._ws.addEventListener("message",h);
      this._ws.send(JSON.stringify(msg));
    });
  }
}
