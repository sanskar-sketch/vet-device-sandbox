/**
 * js/param-registry.js
 *
 * Parameter Registry — defines every connection parameter, action parameter,
 * and output field for all 6 devices.
 *
 * Used by:
 *  - universal-fetcher.html  (dynamic form generation + output schema display)
 *  - param-explorer.html     (standalone parameter reference)
 */

const ParamRegistry = {

  // ─── ORBBEC FEMTO MEGA ──────────────────────────────────────────────────────
  orbbec: {
    label:   "Orbbec Femto Mega",
    icon:    "🎥",
    category:"3D / ToF Camera",
    protocol:"Orbbec SDK (USB / Ethernet) → WebSocket bridge",
    color:   "#1f6feb",

    connectionParams: [
      { key:"transport",  label:"Transport",        type:"select",
        options:["ethernet","usb"], default:"ethernet",
        desc:"Ethernet (network mode) or USB 3.0 direct" },
      { key:"ip",         label:"Camera IP",        type:"text",   default:"192.168.1.100",
        desc:"Only required for Ethernet mode", showIf:{transport:"ethernet"} },
      { key:"port",       label:"SDK Port",         type:"number", default:8090,
        desc:"Orbbec network mode port" },
      { key:"wsEndpoint", label:"WS Bridge URL",    type:"text",   default:"ws://localhost:8091/orbbec",
        desc:"Local Python pyorbbecsdk → WebSocket bridge endpoint" },
      { key:"depthMode",  label:"Depth Mode",       type:"select",
        options:["NFOV_UNBINNED","NFOV_2X2BINNED","WFOV_UNBINNED","WFOV_2X2BINNED"],
        default:"NFOV_UNBINNED", desc:"Sensor FOV and resolution mode" },
      { key:"colorRes",   label:"Color Resolution", type:"select",
        options:["720P","1080P","3072P"], default:"1080P",
        desc:"RGB camera output resolution" },
      { key:"fps",        label:"Frame Rate",       type:"select",
        options:[5,15,30], default:30, desc:"Frames per second for both streams" }
    ],

    actions: [
      {
        key: "stream",
        label: "Stream Frames",
        type: "stream",
        desc: "Continuous depth + color + IR frames",
        params: [],
        output: {
          frame_number:  { type:"integer", desc:"Sequential frame index" },
          timestamp_us:  { type:"integer", unit:"µs", desc:"Epoch microseconds" },
          timestamp_iso: { type:"string",  desc:"ISO 8601 timestamp" },
          depth: {
            width:          { type:"integer", unit:"px" },
            height:         { type:"integer", unit:"px" },
            format:         { type:"string",  desc:"Always Y16 (uint16 per pixel)" },
            depth_scale_mm: { type:"float",   unit:"mm/unit", desc:"Multiply raw by this to get mm" },
            min_depth_mm:   { type:"float",   unit:"mm" },
            max_depth_mm:   { type:"float",   unit:"mm" },
            avg_depth_mm:   { type:"float",   unit:"mm" },
            fps:            { type:"float",   unit:"fps" },
            pixels_uint16:  { type:"Uint16Array|null", desc:"Raw depth buffer; null in sim mode" }
          },
          color: {
            width:      { type:"integer", unit:"px" },
            height:     { type:"integer", unit:"px" },
            format:     { type:"string",  desc:"RGB888" },
            fps:        { type:"float",   unit:"fps" },
            pixels_rgb: { type:"Uint8Array|null", desc:"Raw RGB buffer; null in sim mode" }
          },
          ir: {
            width:  { type:"integer", unit:"px" },
            height: { type:"integer", unit:"px" },
            format: { type:"string" }
          }
        }
      },
      {
        key: "capturePointCloud",
        label: "Capture Point Cloud",
        type: "request",
        params: [],
        output: {
          point_cloud_id:    { type:"string",  desc:"Unique ID for this capture" },
          timestamp_iso:     { type:"string" },
          format:            { type:"string",  desc:"XYZ_float32" },
          total_points:      { type:"integer", desc:"Total sensel count (e.g. 307200)" },
          valid_points:      { type:"integer", desc:"Points with valid depth reading" },
          unit:              { type:"string",  desc:"mm" },
          coordinate_system: { type:"string",  desc:"camera_right_hand" },
          bounding_box:      { type:"object",  desc:"{ x:[min,max], y:[min,max], z:[min,max] }" },
          sample_points:     { type:"array",   desc:"[{x,y,z},...] 5 sample points for preview" },
          points_xyz:        { type:"Float32Array|null", desc:"Full point cloud buffer; null in sim" }
        }
      },
      {
        key: "captureIMU",
        label: "Read IMU",
        type: "request",
        params: [],
        output: {
          imu_id:        { type:"string" },
          timestamp_iso: { type:"string" },
          accelerometer: { type:"object", desc:"{ x_g, y_g, z_g, unit:'g', sample_rate_hz:1600 }" },
          gyroscope:     { type:"object", desc:"{ x_dps, y_dps, z_dps, unit:'deg/s', sample_rate_hz:1600 }" },
          temperature_c: { type:"float",  unit:"°C", desc:"IMU chip temperature" }
        }
      }
    ]
  },

  // ─── FLIR A40 / A50 / A70 ───────────────────────────────────────────────────
  flir: {
    label:   "FLIR A40 / A50 / A70",
    icon:    "🌡️",
    category:"Thermal Imaging",
    protocol:"REST API (HTTP GET) — direct to camera, no bridge needed",
    color:   "#f97316",

    connectionParams: [
      { key:"ip",       label:"Camera IP",      type:"text",   default:"192.168.0.100",
        desc:"Camera's local network IP address" },
      { key:"model",    label:"Model",           type:"select",
        options:["A40","A50","A70"], default:"A70",
        desc:"A40=320×240, A50=464×348, A70=640×480" },
      { key:"tempUnit", label:"Temperature Unit",type:"select",
        options:["C","F","K"], default:"C", desc:"Unit for all temperature readings" }
    ],

    actions: [
      {
        key:"getImage", label:"GET /image/current", type:"request",
        desc:"Fetch current thermal image in specified format",
        params:[
          { key:"format", label:"Image Format", type:"select",
            options:["JPEG","RJPEG","VISIBLE","FUSION"], default:"RJPEG",
            desc:"RJPEG = radiometric JPEG with embedded temperature data" }
        ],
        output:{
          format:        { type:"string" },
          width:         { type:"integer", unit:"px" },
          height:        { type:"integer", unit:"px" },
          size_bytes:    { type:"integer", unit:"bytes" },
          timestamp_iso: { type:"string" },
          blob:          { type:"Blob|null", desc:"Image binary; null in sim, real Blob from camera" }
        }
      },
      {
        key:"getSpot", label:"GET /spot/{n}.json", type:"request",
        desc:"Temperature at a single spot ROI",
        params:[
          { key:"instance", label:"Spot #", type:"number", default:1, min:1, max:10 },
          { key:"unit",     label:"Unit",   type:"select", options:["C","F","K"], default:"C" }
        ],
        output:{
          name:        { type:"string",  desc:"ROI name e.g. Spot1" },
          temperature: { type:"float",   unit:"°C/°F/K", desc:"Point temperature" },
          unit:        { type:"string" },
          x:           { type:"integer", unit:"px", desc:"Pixel X coordinate of spot" },
          y:           { type:"integer", unit:"px", desc:"Pixel Y coordinate of spot" },
          timestamp:   { type:"string" }
        }
      },
      {
        key:"getBox", label:"GET /box/{n}.json", type:"request",
        desc:"Temperature statistics over rectangular ROI",
        params:[
          { key:"instance", label:"Box #", type:"number", default:1, min:1, max:10 },
          { key:"unit",     label:"Unit",  type:"select", options:["C","F","K"], default:"C" }
        ],
        output:{
          name:      { type:"string" },
          max:       { type:"float", unit:"°", desc:"Maximum temperature in region" },
          min:       { type:"float", unit:"°", desc:"Minimum temperature in region" },
          avg:       { type:"float", unit:"°", desc:"Mean temperature in region" },
          unit:      { type:"string" },
          area:      { type:"object", desc:"{ x, y, width, height } in pixels" },
          timestamp: { type:"string" }
        }
      },
      {
        key:"getAlarms", label:"GET /alarms", type:"request",
        desc:"Current state of all configured alarm conditions",
        params:[],
        output:{
          alarms: { type:"array", desc:"[{ instance, name, state, triggered, threshold, unit, associatedROI }]" }
        }
      }
    ]
  },

  // ─── CLARIUS C7 VET HD3 ─────────────────────────────────────────────────────
  clarius: {
    label:   "Clarius C7 Vet HD3",
    icon:    "🔊",
    category:"Ultrasound",
    protocol:"Cast API (TCP 5828) → WebSocket bridge",
    color:   "#22c55e",

    connectionParams: [
      { key:"probeIp",    label:"Probe IP",      type:"text",   default:"192.168.1.1",
        desc:"Probe's Wi-Fi direct IP (from Clarius App → Status)" },
      { key:"castPort",   label:"Cast Port",     type:"number", default:5828,
        desc:"Set to 5828 via 'Research' mode in Clarius App settings" },
      { key:"wsEndpoint", label:"WS Bridge URL", type:"text",   default:"ws://localhost:8092/clarius",
        desc:"Python pyclariuscast → WebSocket bridge" },
      { key:"imgWidth",   label:"Image Width",   type:"number", default:640, desc:"Output frame width px" },
      { key:"imgHeight",  label:"Image Height",  type:"number", default:480, desc:"Output frame height px" }
    ],

    actions: [
      {
        key:"stream", label:"Stream B-Mode Frames", type:"stream",
        desc:"Continuous ultrasound image frames with per-frame IMU",
        params:[
          { key:"depth",  label:"Depth (cm)",    type:"number", default:8,  min:2,  max:18 },
          { key:"gain",   label:"Gain (%)",       type:"number", default:50, min:0,  max:100 },
          { key:"mode",   label:"Imaging Mode",   type:"select",
            options:["bmode","mmode","doppler","pdi"], default:"bmode" }
        ],
        output:{
          frame_number:   { type:"integer" },
          timestamp_us:   { type:"integer", unit:"µs" },
          timestamp_iso:  { type:"string" },
          width:          { type:"integer", unit:"px" },
          height:         { type:"integer", unit:"px" },
          bits_per_pixel: { type:"integer", desc:"8 for greyscale B-mode" },
          data_size_bytes:{ type:"integer" },
          imaging_mode:   { type:"string",  desc:"bmode | mmode | doppler | pdi" },
          depth_cm:       { type:"float",   unit:"cm" },
          gain_pct:       { type:"float",   unit:"%" },
          pixels_uint8:   { type:"Uint8Array|null", desc:"Greyscale frame buffer" },
          imu: {
            timestamp_us: { type:"integer" },
            accel:        { type:"object", desc:"{ x, y, z } in g" },
            gyro:         { type:"object", desc:"{ x, y, z } in deg/s" }
          }
        }
      },
      {
        key:"captureRawIQ", label:"Capture Raw IQ/RF", type:"request",
        desc:"IQ signal data captured when imaging is frozen",
        params:[],
        output:{
          lines:               { type:"integer", desc:"Scan lines" },
          samples_per_line:    { type:"integer" },
          data_size_bytes:     { type:"integer" },
          lateral_spacing_mm:  { type:"float",   unit:"mm" },
          axial_spacing_mm:    { type:"float",   unit:"mm" },
          center_frequency_mhz:{ type:"float",   unit:"MHz" },
          sample_rate_mhz:     { type:"float",   unit:"MHz" },
          depth_start_mm:      { type:"float",   unit:"mm" },
          depth_end_mm:        { type:"float",   unit:"mm" },
          iq_data:             { type:"Float32Array|null", desc:"Interleaved [I0,Q0,I1,Q1,...] pairs" }
        }
      }
    ]
  },

  // ─── BIONET VEMO ────────────────────────────────────────────────────────────
  vemo: {
    label:   "Bionet VEMO",
    icon:    "💓",
    category:"ECG",
    protocol:"BT-Link (TCP/IP or USB Serial) → WebSocket bridge",
    color:   "#f43f5e",

    connectionParams: [
      { key:"host",       label:"Host / IP",       type:"text",   default:"192.168.1.50" },
      { key:"port",       label:"Port",             type:"number", default:3000 },
      { key:"wsEndpoint", label:"WS Bridge URL",    type:"text",   default:"ws://localhost:8093/vemo" },
      { key:"sampleRate", label:"Sample Rate (Hz)", type:"select", options:[250,500,1000], default:500 },
      { key:"leads",      label:"Leads",            type:"select", options:[3,6], default:6,
        desc:"3 = I/II/III, 6 = adds aVR/aVL/aVF" },
      { key:"species",    label:"Animal Species",   type:"select",
        options:["canine","feline","equine","bovine"], default:"canine",
        desc:"Used for species-appropriate reference ranges" }
    ],

    actions: [
      {
        key:"stream", label:"Stream ECG Packets", type:"stream",
        desc:"Continuous per-lead ECG sample packets",
        params:[],
        output:{
          timestamp_ms:   { type:"integer", unit:"ms" },
          lead:           { type:"string",  desc:"I | II | III | aVR | aVL | aVF" },
          samples_mv:     { type:"array",   desc:"Array of float mV values (25 samples per packet)" },
          sample_rate_hz: { type:"integer", unit:"Hz" }
        }
      },
      {
        key:"captureRecord", label:"Capture ECG Record", type:"request",
        desc:"Full multi-lead ECG record with measurements and HL7 export",
        params:[
          { key:"duration_s", label:"Duration (s)", type:"number", default:10, min:5, max:60 }
        ],
        output:{
          record_id:     { type:"string" },
          timestamp_iso: { type:"string" },
          duration_s:    { type:"integer", unit:"s" },
          sample_rate_hz:{ type:"integer", unit:"Hz" },
          leads_captured:{ type:"array",   desc:"['I','II','III','aVR','aVL','aVF']" },
          measurements: {
            heart_rate_bpm:    { type:"integer", unit:"bpm" },
            pr_interval_ms:    { type:"integer", unit:"ms",  desc:"Normal dog: 60-130 ms" },
            qrs_duration_ms:   { type:"integer", unit:"ms",  desc:"Normal dog: 40-80 ms" },
            qt_interval_ms:    { type:"integer", unit:"ms" },
            qtc_interval_ms:   { type:"integer", unit:"ms",  desc:"Rate-corrected QT" },
            st_deviation_mv:   { type:"float",   unit:"mV",  desc:"ST elevation/depression" },
            p_axis_deg:        { type:"float",   unit:"°" },
            qrs_axis_deg:      { type:"float",   unit:"°" }
          },
          interpretation: {
            rhythm:        { type:"string",  desc:"e.g. Normal Sinus Rhythm" },
            abnormalities: { type:"array",   desc:"List of detected abnormalities" },
            confidence:    { type:"float",   desc:"0.0–1.0" }
          },
          hl7_aecg_xml: { type:"string", desc:"HL7 aECG XML (ISO 11073) string" }
        }
      }
    ]
  },

  // ─── TEKSCAN STRIDEWAY ───────────────────────────────────────────────────────
  tekscan: {
    label:   "Tekscan Animal Strideway",
    icon:    "🐾",
    category:"Gait & Pressure",
    protocol:"COM SDK (Windows ActiveX) → WebSocket bridge",
    color:   "#84cc16",

    connectionParams: [
      { key:"wsEndpoint", label:"WS Bridge URL",       type:"text",   default:"ws://localhost:8094/tekscan" },
      { key:"rows",       label:"Sensor Rows",          type:"number", default:48,  desc:"Sensel matrix rows" },
      { key:"cols",       label:"Sensor Columns",       type:"number", default:64,  desc:"Sensel matrix columns" },
      { key:"frameRate",  label:"Frame Rate (Hz)",      type:"select", options:[50,100,250], default:100 },
      { key:"calibration",label:"Calibration (N/raw)",  type:"number", default:0.42,
        desc:"Newton per raw unit. Set by calibration procedure." },
      { key:"species",    label:"Animal Species",       type:"select",
        options:["canine","feline","equine","bovine"], default:"canine" }
    ],

    actions: [
      {
        key:"stream", label:"Stream Pressure Frames", type:"stream",
        desc:"Continuous pressure matrix frames at configured frame rate",
        params:[],
        output:{
          frame_id:         { type:"string" },
          timestamp_ms:     { type:"integer", unit:"ms" },
          timestamp_iso:    { type:"string" },
          rows:             { type:"integer", desc:"Sensel rows" },
          cols:             { type:"integer", desc:"Sensel columns" },
          calibration_n_per_raw: { type:"float", unit:"N/raw" },
          peak_force_N:     { type:"float",   unit:"N",   desc:"Highest force across all sensels" },
          total_force_N:    { type:"float",   unit:"N",   desc:"Sum of all active sensel forces" },
          active_sensels:   { type:"integer", desc:"Number of sensels with force > threshold" },
          contact_area_cm2: { type:"float",   unit:"cm²", desc:"active_sensels × 0.0154 cm²" },
          center_of_pressure: {
            x_sensel: { type:"float", desc:"CoP X in sensel units" },
            y_sensel: { type:"float", desc:"CoP Y in sensel units" }
          },
          matrix_flat: { type:"Float32Array|null", desc:"rows×cols float32 array in Newtons; null in sim" }
        }
      },
      {
        key:"exportXML", label:"Export FScan XML", type:"request",
        desc:"Session export in Tekscan FScan format",
        params:[],
        output:{
          xml: { type:"string", desc:"FScan XML with session metadata, frames, and gait events" }
        }
      }
    ]
  },

  // ─── VETSCAN VS2 / OPTICELL ─────────────────────────────────────────────────
  vetscan: {
    label:   "Vetscan VS2 / OptiCell",
    icon:    "🩸",
    category:"Blood Biomarkers",
    protocol:"ASTM E1394 (RS-232/USB) → WebSocket bridge",
    color:   "#f59e0b",

    connectionParams: [
      { key:"model",       label:"Analyzer Model",  type:"select",
        options:["vs2","opticell"], default:"vs2",
        desc:"VS2 = blood chemistry, OptiCell = hematology CBC" },
      { key:"wsEndpoint",  label:"WS Bridge URL",   type:"text",  default:"ws://localhost:8095/vetscan" },
      { key:"interface",   label:"Interface",        type:"select",
        options:["usb","rs232","ethernet"], default:"usb" },
      { key:"port",        label:"Port / Host",      type:"text",  default:"COM3" },
      { key:"baud",        label:"Baud Rate",        type:"select",
        options:[9600,19200,38400], default:9600 }
    ],

    actions: [
      {
        key:"runAnalysis", label:"Run Analysis", type:"request",
        desc:"Submit sample rotor and wait for results (~12 min real, instant in sim)",
        params:[
          { key:"patient_id",  label:"Patient ID",   type:"text",   default:"PAT-001" },
          { key:"rotor_type",  label:"Rotor / Panel", type:"select",
            options:["canine","feline","equine","avian","comprehensive"],
            default:"canine" },
          { key:"sample_type", label:"Sample Type",  type:"select",
            options:["whole_blood","serum","plasma"], default:"whole_blood" },
          { key:"volume_ul",   label:"Volume (µL)",  type:"number", default:2, min:1, max:5 }
        ],
        output:{
          run_id:      { type:"string" },
          timestamp_iso:{ type:"string" },
          device:      { type:"string",  desc:"Vetscan VS2 or Vetscan OptiCell" },
          patient_id:  { type:"string" },
          rotor_type:  { type:"string" },
          sample_type: { type:"string" },
          volume_ul:   { type:"float",   unit:"µL" },
          status:      { type:"string",  desc:"completed | error | qc_failed" },
          qc_passed:   { type:"boolean" },
          analytes: {
            _desc: "Array of analyte results",
            name:            { type:"string",  desc:"e.g. Glucose, BUN, ALT, WBC..." },
            value:           { type:"float",   desc:"Measured value" },
            unit:            { type:"string",  desc:"mg/dL, U/L, g/dL, 10³/µL..." },
            reference_range: { type:"array",   desc:"[low, high] for species" },
            flag:            { type:"string",  desc:"N = normal, H = high, L = low" }
          },
          summary: {
            normal:   { type:"integer", desc:"Count of analytes with flag N" },
            abnormal: { type:"integer", desc:"Count of analytes with flag H or L" },
            total:    { type:"integer" }
          }
        }
      },
      {
        key:"getStatus", label:"Get Status", type:"request",
        desc:"Query analyzer ready state",
        params:[],
        output:{
          device:        { type:"string" },
          state:         { type:"string",  desc:"Ready | Running | Error | Warming" },
          temperature_c: { type:"float",   unit:"°C", desc:"Analyzer internal temp" },
          rotor_count:   { type:"integer", desc:"Total rotors run on this unit" },
          last_qc:       { type:"string",  desc:"ISO timestamp of last QC run" },
          errors:        { type:"array",   desc:"Active error codes" }
        }
      }
    ]
  }
};
