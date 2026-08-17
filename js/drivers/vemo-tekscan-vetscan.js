/**
 * drivers/vemo.js  — Bionet VEMO ECG
 *
 * DATA CONTRACT:
 * connect()  → { ok, info:{ model, firmware, serial } }
 *
 * Events:
 *   "packet" → { timestamp_ms, lead:"I"|"II"|..., samples_mv:[...], sample_rate_hz }
 *
 * captureRecord(duration_s) → {
 *     record_id, timestamp_iso, duration_s, sample_rate_hz,
 *     leads_captured:[], measurements:{ heart_rate_bpm, pr_interval_ms,
 *       qrs_duration_ms, qt_interval_ms, qtc_interval_ms, st_deviation_mv,
 *       p_axis_deg, qrs_axis_deg },
 *     interpretation:{ rhythm, abnormalities:[], confidence },
 *     hl7_aecg_xml: string
 * }
 *
 * captureVitals() → {  // bundled pulse-ox + NIBP cuff, same multiparameter monitor
 *     vitals_id, timestamp_iso,
 *     pulse_oximetry:{ spo2_pct, pulse_rate_bpm, perfusion_index_pct },
 *     non_invasive_bp:{ systolic_mmhg, diastolic_mmhg, map_mmhg, method }
 * }
 */

class VemoSimDriver extends DeviceDriver {
  constructor(cfg) { super(cfg); this._timer=null; this._t=0; this._hr=75; }

  async connect() {
    await delay(500);
    this.connected=true;
    return { ok:true, info:{ model:"BIONET VEMO [SIM]", firmware:"3.1.0-sim", serial:"VM-SIM-004421" } };
  }

  async disconnect() { this.stopStream(); this.connected=false; }

  startStream(sr=500, leads=6, hr=75) {
    this._hr=hr; this._sr=sr;
    const intervalMs=1000/(sr/25); // send 25-sample chunks
    this._timer=setInterval(()=>{
      this._t+=25/sr;
      for(const lead of["I","II","III","aVR","aVL","aVF"].slice(0,leads)){
        const samples=Array.from({length:25},(_,i)=>
          parseFloat(this._ecgSample(this._t-(24-i)/sr, this._hr, lead).toFixed(4)));
        this.emit("packet",{timestamp_ms:Date.now(),lead,samples_mv:samples,sample_rate_hz:sr});
      }
    }, intervalMs);
  }

  stopStream() { if(this._timer){clearInterval(this._timer);this._timer=null;} }

  _ecgSample(t, hr, lead) {
    const period=60/hr, tp=((t%period)+period)%period, tn=tp/period;
    let v=0;
    if(tn<0.10) v=0.15*Math.sin(tn/0.10*Math.PI);
    else if(tn<0.14) v=-0.10;
    else if(tn<0.15) v=1.00;
    else if(tn<0.17) v=-0.25;
    else if(tn<0.20) v=0;
    else if(tn<0.35) v=0.25*Math.sin((tn-0.20)/0.15*Math.PI);
    const flip=lead==="aVR"?-1:1;
    return v*flip*(0.8+Math.random()*0.04);
  }

  async captureRecord(duration_s=10) {
    await delay(duration_s*80); // fast sim
    const hr=Math.round(this._hr+rand(-2,2,0));
    return {
      record_id:`VEMO-SIM-${Date.now()}`, timestamp_iso:nowISO(),
      duration_s, sample_rate_hz:this._sr||500,
      leads_captured:["I","II","III","aVR","aVL","aVF"],
      measurements:{
        heart_rate_bpm:hr, pr_interval_ms:rand(80,200,0),
        qrs_duration_ms:rand(40,80,0), qt_interval_ms:rand(200,400,0),
        qtc_interval_ms:rand(220,440,0), st_deviation_mv:rand(-0.1,0.1,3),
        p_axis_deg:rand(0,90,1), qrs_axis_deg:rand(-30,90,1)
      },
      interpretation:{ rhythm:"Normal Sinus Rhythm", abnormalities:[], confidence:0.96 },
      hl7_aecg_xml: `<?xml version="1.0"?><AnnotatedECG xmlns="urn:hl7-org:v3"><!-- HR=${hr} --></AnnotatedECG>`
    };
  }

  async captureVitals() {
    await delay(600);
    const systolic = rand(105, 165, 0);
    const diastolic = rand(55, 100, 0);
    return {
      vitals_id: `VIT-SIM-${Date.now()}`, timestamp_iso: nowISO(),
      pulse_oximetry: { spo2_pct: rand(93, 99, 0), pulse_rate_bpm: Math.round(this._hr + rand(-3, 3, 0)), perfusion_index_pct: rand(0.5, 8, 1) },
      non_invasive_bp: { systolic_mmhg: systolic, diastolic_mmhg: diastolic, map_mmhg: Math.round(diastolic + (systolic - diastolic) / 3), method: "oscillometric" }
    };
  }
}

class VemoRealDriver extends DeviceDriver {
  constructor(cfg){super(cfg);this._ws=null;}

  async connect(){
    return new Promise((res,rej)=>{
      this._ws=new WebSocket(this.config.wsEndpoint);
      this._ws.onopen=()=>this._ws.send(JSON.stringify({cmd:"connect",host:this.config.host,port:this.config.port}));
      this._ws.onmessage=(evt)=>{
        const msg=JSON.parse(evt.data);
        if(msg.type==="connected"){this.connected=true;res({ok:true,info:msg.info});}
        else if(msg.type==="packet") this.emit("packet",msg.data);
        else if(msg.type==="error")  rej(new Error(msg.message));
      };
      this._ws.onerror=()=>rej(new Error("WS failed"));
    });
  }

  startStream(sr,leads){this._ws.send(JSON.stringify({cmd:"start_ecg",sr,leads}));}
  stopStream(){this._ws.send(JSON.stringify({cmd:"stop_ecg"}));}
  async captureRecord(duration_s){return this._req({cmd:"capture_record",duration_s});}
  async captureVitals(){return this._req({cmd:"capture_vitals"});}
  async disconnect(){this._ws?.send(JSON.stringify({cmd:"disconnect"}));this._ws?.close();this.connected=false;}

  _req(msg){
    return new Promise((res,rej)=>{
      const h=(evt)=>{const d=JSON.parse(evt.data);
        if(d.type===msg.cmd+"_result"){this._ws.removeEventListener("message",h);res(d.data);}
        else if(d.type==="error"){this._ws.removeEventListener("message",h);rej(new Error(d.message));}
      };
      this._ws.addEventListener("message",h);
      this._ws.send(JSON.stringify(msg));
    });
  }
}


/**
 * drivers/tekscan.js  — Tekscan Animal Strideway
 *
 * DATA CONTRACT:
 * connect()  → { ok, info:{ system, rows, cols, frame_rate_hz, calibration } }
 *
 * Events:
 *   "frame"  → { frame_id, timestamp_ms, timestamp_iso,
 *                rows, cols, calibration_n_per_raw,
 *                peak_force_N, total_force_N, active_sensels, contact_area_cm2,
 *                center_of_pressure:{ x_sensel, y_sensel },
 *                matrix_flat: Float32Array|null  ← rows*cols float32 in N
 *              }
 *
 * exportXML() → XML string (FScan format)
 */

class TekscanSimDriver extends DeviceDriver {
  constructor(cfg){super(cfg);this._timer=null;this._frame=0;this._phase=0;}

  async connect(){
    await delay(500);
    this.connected=true;
    return { ok:true, info:{
      system:"Animal Strideway [SIM]",
      rows:this.config.rows||48, cols:this.config.cols||64,
      frame_rate_hz:this.config.frameRate||100, calibration:0.42
    }};
  }

  async disconnect(){this.stopStream();this.connected=false;}

  startStream(){
    const intervalMs=1000/(this.config.frameRate||100);
    this._timer=setInterval(()=>{
      this._frame++; this._phase+=0.05;
      this.emit("frame",this._buildFrame());
    }, intervalMs);
  }

  stopStream(){if(this._timer){clearInterval(this._timer);this._timer=null;}}

  _buildFrame(){
    const rows=this.config.rows||48, cols=this.config.cols||64;
    const calib=0.42, phase=this._phase;
    const cx=cols/2+Math.sin(phase)*cols*0.15;
    const cy=rows/2+Math.cos(phase*0.7)*rows*0.1;
    const paws=[
      {x:cx-cols*0.15,y:cy-rows*0.2,r:cols*0.07,a:0.6+0.3*Math.sin(phase)},
      {x:cx+cols*0.15,y:cy-rows*0.1,r:cols*0.07,a:0.5+0.4*Math.cos(phase)},
      {x:cx-cols*0.12,y:cy+rows*0.18,r:cols*0.07,a:0.7+0.2*Math.sin(phase+1)},
      {x:cx+cols*0.12,y:cy+rows*0.2, r:cols*0.07,a:0.4+0.5*Math.cos(phase+2)},
    ];
    let peak=0,total=0,active=0,copX=0,copY=0;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      let v=0;
      for(const p of paws){const d=Math.sqrt((c-p.x)**2+(r-p.y)**2);if(d<p.r)v+=p.a*(1-d/p.r)**2;}
      const f=Math.min(1,v)*5*calib;
      if(f>0.01){active++;total+=f;copX+=c*f;copY+=r*f;}
      peak=Math.max(peak,f);
    }
    return {
      frame_id:`f_${this._frame}`, timestamp_ms:Date.now(), timestamp_iso:nowISO(),
      rows, cols, calibration_n_per_raw:calib,
      peak_force_N:parseFloat(peak.toFixed(3)),
      total_force_N:parseFloat(total.toFixed(3)),
      active_sensels:active,
      contact_area_cm2:parseFloat((active*0.0154).toFixed(3)),
      center_of_pressure:total>0?{x_sensel:parseFloat((copX/total).toFixed(2)),y_sensel:parseFloat((copY/total).toFixed(2))}:{x_sensel:0,y_sensel:0},
      matrix_flat:null, // sim: no raw buffer
      _simPhase:this._phase  // passed to renderer
    };
  }

  async exportXML(frameCount){
    return `<?xml version="1.0"?><FScan version="9.0"><Session totalFrames="${frameCount}"><SensorConfig rows="${this.config.rows||48}" cols="${this.config.cols||64}" frameRate="${this.config.frameRate||100}" calibration="0.42" unit="N"/></Session></FScan>`;
  }
}

class TekscanRealDriver extends DeviceDriver {
  constructor(cfg){super(cfg);this._ws=null;}

  async connect(){
    return new Promise((res,rej)=>{
      this._ws=new WebSocket(this.config.wsEndpoint);
      this._ws.onopen=()=>this._ws.send(JSON.stringify({cmd:"connect"}));
      this._ws.onmessage=(evt)=>{
        const msg=JSON.parse(evt.data);
        if(msg.type==="connected"){this.connected=true;res({ok:true,info:msg.info});}
        else if(msg.type==="frame") this.emit("frame",msg.data);
        else if(msg.type==="error") rej(new Error(msg.message));
      };
      this._ws.onerror=()=>rej(new Error("WS failed"));
    });
  }

  startStream(){this._ws.send(JSON.stringify({cmd:"start_acquisition"}));}
  stopStream(){this._ws.send(JSON.stringify({cmd:"stop_acquisition"}));}
  async exportXML(){return this._req({cmd:"export_xml"});}
  async disconnect(){this._ws?.send(JSON.stringify({cmd:"disconnect"}));this._ws?.close();this.connected=false;}

  _req(msg){
    return new Promise((res,rej)=>{
      const h=(evt)=>{const d=JSON.parse(evt.data);
        if(d.type===msg.cmd+"_result"){this._ws.removeEventListener("message",h);res(d.data);}
        else if(d.type==="error"){this._ws.removeEventListener("message",h);rej(new Error(d.message));}
      };
      this._ws.addEventListener("message",h);
      this._ws.send(JSON.stringify(msg));
    });
  }
}


/**
 * drivers/vetscan.js  — Vetscan VS2 / OptiCell
 *
 * DATA CONTRACT:
 * connect()   → { ok, info:{ model, firmware, serial, state } }
 * getStatus() → { device, state, temperature_c, rotor_count, last_qc, errors }
 * runAnalysis(config) → result object (below)  — polls until done
 * result shape: {
 *     run_id, timestamp_iso, device, patient_id, rotor_type, sample_type, volume_ul,
 *     status:"completed", qc_passed:bool,
 *     analytes:[{ name, value, unit, reference_range:[lo,hi], flag:"N"|"H"|"L" }],
 *     summary:{ normal, abnormal, total }
 * }
 */

class VetscanSimDriver extends DeviceDriver {

  async connect(){
    await delay(500);
    this.connected=true;
    return { ok:true, info:{ model:`Vetscan ${document?.getElementById?.('model')?.value||'VS2'} [SIM]`, firmware:"2.8.1-sim", serial:"VS2-SIM-20240556", state:"Ready" } };
  }

  async disconnect(){this.connected=false;}

  async getStatus(){
    await delay(300);
    return { device:"VS2", state:"Ready", temperature_c:rand(35,37,1), rotor_count:rand(45,120,0), last_qc:"2024-07-20T08:15:00Z", errors:[] };
  }

  async runAnalysis({patient_id, rotor_type, sample_type, model="vs2"}, onProgress){
    const steps=20;
    for(let i=1;i<=steps;i++){
      await delay(120);
      if(onProgress) onProgress(Math.round(i/steps*100));
    }
    const isCBC = model==="opticell";
    const analytes = isCBC ? [
      {name:"WBC",value:rand(6,16,2),unit:"10³/µL",ref:[6.0,17.0]},
      {name:"RBC",value:rand(5.5,8.5,2),unit:"10⁶/µL",ref:[5.5,8.5]},
      {name:"Hemoglobin",value:rand(12,18,1),unit:"g/dL",ref:[12,18]},
      {name:"Hematocrit",value:rand(37,55,1),unit:"%",ref:[37,55]},
      {name:"Platelets",value:rand(180,400,0),unit:"10³/µL",ref:[180,400]},
      {name:"Neutrophils",value:rand(3,11,2),unit:"10³/µL",ref:[3,11.5]},
      {name:"Lymphocytes",value:rand(1,5,2),unit:"10³/µL",ref:[1,4.8]},
      {name:"Monocytes",value:rand(0.2,1.5,2),unit:"10³/µL",ref:[0.2,1.5]}
    ] : [
      {name:"Glucose",value:rand(90,120,1),unit:"mg/dL",ref:[70,138]},
      {name:"BUN",value:rand(15,30,1),unit:"mg/dL",ref:[9,29]},
      {name:"Creatinine",value:rand(0.8,1.5,2),unit:"mg/dL",ref:[0.5,1.6]},
      {name:"Calcium",value:rand(9,11,2),unit:"mg/dL",ref:[9,11.4]},
      {name:"Total Protein",value:rand(5.5,7.5,2),unit:"g/dL",ref:[5.4,7.5]},
      {name:"Albumin",value:rand(3,4.2,2),unit:"g/dL",ref:[2.9,4.2]},
      {name:"ALT",value:rand(30,90,0),unit:"U/L",ref:[18,86]},
      {name:"ALP",value:rand(40,150,0),unit:"U/L",ref:[12,122]},
      {name:"Total Bilirubin",value:rand(0.1,0.4,2),unit:"mg/dL",ref:[0.1,0.5]},
      {name:"Sodium",value:rand(142,152,1),unit:"mmol/L",ref:[142,152]},
      {name:"Potassium",value:rand(3.8,5.4,2),unit:"mmol/L",ref:[3.8,5.4]},
      {name:"Chloride",value:rand(105,115,1),unit:"mmol/L",ref:[105,115]}
    ];
    analytes.forEach(a=>{
      a.flag="N";
      if(Math.random()>0.82){ a.flag=Math.random()>0.5?"H":"L";
        if(a.flag==="H") a.value=parseFloat((a.ref[1]+rand(0.1,a.ref[1]*0.2,2)).toFixed(2));
        if(a.flag==="L") a.value=parseFloat(Math.max(0,a.ref[0]-rand(0.1,a.ref[0]*0.15,2)).toFixed(2));
      }
      a.reference_range=a.ref; delete a.ref;
    });
    const normal=analytes.filter(a=>a.flag==="N").length;
    return { run_id:`RUN-${Date.now()}`, timestamp_iso:nowISO(), device:isCBC?"Vetscan OptiCell":"Vetscan VS2",
      patient_id, rotor_type, sample_type, volume_ul:2.0, status:"completed", qc_passed:true,
      analytes, summary:{normal,abnormal:analytes.length-normal,total:analytes.length} };
  }
}

class VetscanRealDriver extends DeviceDriver {
  constructor(cfg){super(cfg);this._ws=null;}

  async connect(){
    return new Promise((res,rej)=>{
      this._ws=new WebSocket(this.config.wsEndpoint);
      this._ws.onopen=()=>this._ws.send(JSON.stringify({cmd:"connect"}));
      this._ws.onmessage=(evt)=>{
        const msg=JSON.parse(evt.data);
        if(msg.type==="connected"){this.connected=true;res({ok:true,info:msg.info});}
        else if(msg.type==="progress") this.emit("progress",msg.pct);
        else if(msg.type==="error")    rej(new Error(msg.message));
      };
      this._ws.onerror=()=>rej(new Error("WS failed"));
    });
  }

  async getStatus(){return this._req({cmd:"get_status"});}
  async runAnalysis(cfg, onProgress){
    this.on("progress", pct=>{ if(onProgress) onProgress(pct); });
    return this._req({cmd:"run_analysis",...cfg});
  }
  async disconnect(){this._ws?.send(JSON.stringify({cmd:"disconnect"}));this._ws?.close();this.connected=false;}

  _req(msg){
    return new Promise((res,rej)=>{
      const h=(evt)=>{const d=JSON.parse(evt.data);
        if(d.type===msg.cmd+"_result"){this._ws.removeEventListener("message",h);res(d.data);}
        else if(d.type==="error"){this._ws.removeEventListener("message",h);rej(new Error(d.message));}
      };
      this._ws.addEventListener("message",h);
      this._ws.send(JSON.stringify(msg));
    });
  }
}
