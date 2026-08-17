
const log = new SandboxLogger('console');
let currentDeviceKey = null;
let currentAction    = null;
let driver           = null;
let streamCount      = 0;

// Multi-device dashboard state
const activeSensors = {}; // { deviceKey: { driver, def, paused, count, lastData } }
let dashboardPausedAll = false;

initTabs();

// ── Build device selector ──────────────────────────────────────────────────
const sel = document.getElementById('deviceSelector');
Object.entries(ParamRegistry).forEach(([key, def]) => {
  const btn = document.createElement('div');
  btn.className = 'device-btn';
  btn.dataset.key = key;
  btn.innerHTML = `<span class="device-btn-icon">${def.icon}</span><span class="device-btn-label">${def.label.split('/')[0].trim()}</span>`;
  btn.onclick = () => selectDevice(key);
  sel.appendChild(btn);
});

// ── Select device ──────────────────────────────────────────────────────────
function selectDevice(key) {
  currentDeviceKey = key;
  currentAction    = null;
  const def = ParamRegistry[key];

  // Highlight button
  document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.device-btn[data-key="${key}"]`).classList.add('active');

  // Show info
  document.getElementById('selectedDevice').style.display = 'block';
  document.getElementById('selectedLabel').textContent    = def.label;
  document.getElementById('selectedProtocol').textContent = def.protocol;

  // Build connection form
  buildForm('connectionForm', def.connectionParams, DeviceConfig[key] || {});
  document.getElementById('connectionCard').style.display = 'block';
  document.getElementById('connectBtn').disabled = false;
  document.getElementById('disconnectBtn').disabled = true;

  // Hide actions until connected
  document.getElementById('actionsCard').style.display = 'none';
  document.getElementById('actionParamsCard').style.display = 'none';

  log.info(`Selected: ${def.label}  [${def.category}]`);
  clearStream();
}

// ── Build a form from a param definition list ──────────────────────────────
function buildForm(containerId, params, currentValues) {
  const form = document.getElementById(containerId);
  form.innerHTML = '';
  params.forEach(p => {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';
    wrapper.dataset.paramKey = p.key;

    const label = document.createElement('label');
    label.textContent = p.label;
    if (p.desc) label.title = p.desc;
    wrapper.appendChild(label);

    let input;
    if (p.type === 'select') {
      input = document.createElement('select');
      p.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if ((currentValues[p.key] ?? p.default) == opt) o.selected = true;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = p.type === 'number' ? 'number' : 'text';
      input.value = currentValues[p.key] ?? p.default ?? '';
      if (p.min !== undefined) input.min = p.min;
      if (p.max !== undefined) input.max = p.max;
    }
    input.id = `param_${containerId}_${p.key}`;
    if (p.desc) input.title = p.desc;
    wrapper.appendChild(input);

    if (p.desc) {
      const hint = document.createElement('span');
      hint.className = 'text-muted'; hint.style.fontSize = '10px';
      hint.textContent = p.desc;
      wrapper.appendChild(hint);
    }
    form.appendChild(wrapper);
  });
}

// ── Read form values ───────────────────────────────────────────────────────
function readForm(containerId, params) {
  const out = {};
  params.forEach(p => {
    const el = document.getElementById(`param_${containerId}_${p.key}`);
    if (!el) return;
    out[p.key] = p.type === 'number' ? parseFloat(el.value) : el.value;
  });
  return out;
}

// ── Connect ────────────────────────────────────────────────────────────────
async function connectDevice() {
  if (!currentDeviceKey) return;
  const def = ParamRegistry[currentDeviceKey];
  const values = readForm('connectionForm', def.connectionParams);

  // Push values into DeviceConfig so DriverFactory picks them up
  Object.assign(DeviceConfig[currentDeviceKey] || {}, values);
  DeviceConfig[currentDeviceKey] = Object.assign(DeviceConfig[currentDeviceKey] || {}, values);

  document.getElementById('connectBtn').disabled = true;
  log.info(`Connecting to ${def.label}...`);

  try {
    driver = DriverFactory.get(currentDeviceKey);
    const result = await driver.connect();
    log.success(`Connected: ${result.info.name}  FW:${result.info.firmware}  SN:${result.info.serial}`);
    document.getElementById('disconnectBtn').disabled = false;
    showActions();
  } catch (err) {
    log.error(`Connection failed: ${err.message}`);
    document.getElementById('connectBtn').disabled = false;
  }
}

// ── Disconnect ─────────────────────────────────────────────────────────────
async function disconnectDevice() {
  if (driver) {
    try { await driver.disconnect(); } catch(e) {}
  }
  driver = null;
  document.getElementById('connectBtn').disabled = false;
  document.getElementById('disconnectBtn').disabled = true;
  document.getElementById('actionsCard').style.display = 'none';
  document.getElementById('actionParamsCard').style.display = 'none';
  log.warn('Disconnected.');
}

// ── Show actions ───────────────────────────────────────────────────────────
function showActions() {
  const def = ParamRegistry[currentDeviceKey];
  const list = document.getElementById('actionList');
  list.innerHTML = '';

  def.actions.forEach(action => {
    const btn = document.createElement('div');
    btn.className = 'action-btn';
    btn.innerHTML = `<span class="action-type ${action.type}">${action.type}</span>
      <div><strong style="font-size:12px;">${action.label}</strong>
      <div class="text-muted" style="font-size:10px;margin-top:1px;">${action.desc}</div></div>`;
    btn.onclick = () => selectAction(action);
    list.appendChild(btn);
  });

  document.getElementById('actionsCard').style.display = 'block';
}

// ── Select action ──────────────────────────────────────────────────────────
function selectAction(action) {
  currentAction = action;

  // Show schema
  renderSchema(action.output);
  document.querySelector('[data-target="tab-schema"]').click();

  // Show action params form if any
  if (action.params && action.params.length > 0) {
    buildForm('actionParamsForm', action.params, {});
    document.getElementById('actionParamsCard').style.display = 'block';
    document.getElementById('executeBtn').textContent = action.type === 'stream'
      ? '▶ Start Stream' : '▶ Send Request';
  } else {
    document.getElementById('actionParamsCard').style.display = 'block';
    document.getElementById('actionParamsForm').innerHTML =
      '<p class="text-muted" style="font-size:12px;">No parameters required for this action.</p>';
    document.getElementById('executeBtn').textContent = action.type === 'stream'
      ? '▶ Start Stream' : '▶ Send Request';
  }

  log.info(`Selected action: ${action.label}`);
}

// ── Execute action ─────────────────────────────────────────────────────────
async function executeAction() {
  if (!currentAction || !driver) return;
  const action = currentAction;
  const params = action.params?.length
    ? readForm('actionParamsForm', action.params)
    : {};

  clearStream();
  log.info(`Executing: ${action.label}`);

  try {
    if (action.type === 'stream') {
      await runStream(action, params);
    } else {
      await runRequest(action, params);
    }
  } catch(err) {
    log.error(`Error: ${err.message}`);
  }
}

// ── Streaming action ───────────────────────────────────────────────────────
async function runStream(action, params) {
  // Stop any existing stream
  if (driver.stopStream) driver.stopStream();
  if (driver._timer) clearInterval(driver._timer);

  document.getElementById('executeBtn').textContent = '■ Stop Stream';
  document.getElementById('executeBtn').onclick = stopStream;

  const def = ParamRegistry[currentDeviceKey];
  streamCount = 0;

  // Register in dashboard
  if (!activeSensors[currentDeviceKey]) {
    activeSensors[currentDeviceKey] = {
      driver, def, paused: false, count: 0, lastData: null
    };
    addDashboardCard(currentDeviceKey);
  }

  driver.on('frame',   d => {
    appendStreamData(d, 'frame');
    updateDashboard(currentDeviceKey, d, 'frame');
  });
  driver.on('packet',  d => {
    appendStreamData(d, 'packet');
    updateDashboard(currentDeviceKey, d, 'packet');
  });

  // Start with appropriate params
  if (currentDeviceKey === 'orbbec')   driver.startStream(100);
  else if (currentDeviceKey === 'clarius') driver.startStream(params.depth||8, params.gain||50, params.mode||'bmode');
  else if (currentDeviceKey === 'vemo')    driver.startStream(params.sampleRate||500, params.leads||6);
  else if (currentDeviceKey === 'tekscan') driver.startStream();

  log.success(`Stream started for ${def.label}`);
}

function stopStream() {
  if (driver?.stopStream) driver.stopStream();
  document.getElementById('executeBtn').textContent = '▶ Start Stream';
  document.getElementById('executeBtn').onclick = executeAction;
  
  // Remove from dashboard
  if (currentDeviceKey && activeSensors[currentDeviceKey]) {
    delete activeSensors[currentDeviceKey];
    removeDashboardCard(currentDeviceKey);
  }
  
  log.warn('Stream stopped.');
}

// ── Request action ─────────────────────────────────────────────────────────
async function runRequest(action, params) {
  let result;

  if (currentDeviceKey === 'flir') {
    if (action.key === 'getImage')     result = await driver.getImage(params.format);
    else if (action.key === 'getSpot') result = await driver.getSpot(params.instance||1, params.unit||'C');
    else if (action.key === 'getBox')  result = await driver.getBox(params.instance||1, params.unit||'C');
    else if (action.key === 'getLine') result = await driver.getLine(params.instance||1, params.unit||'C');
    else if (action.key === 'getAlarms')     result = await driver.getAlarms();
    else if (action.key === 'getTempSensor') result = await driver.getTempSensor(params.instance||1, params.unit||'C');
  } else if (currentDeviceKey === 'orbbec') {
    if (action.key === 'capturePointCloud') result = await driver.capturePointCloud();
    else if (action.key === 'captureIMU')   result = await driver.captureIMU();
  } else if (currentDeviceKey === 'clarius') {
    if (action.key === 'captureRawIQ') result = await driver.captureRawIQ();
  } else if (currentDeviceKey === 'vemo') {
    if (action.key === 'captureRecord') result = await driver.captureRecord(params.duration_s||10);
  } else if (currentDeviceKey === 'tekscan') {
    if (action.key === 'exportXML') result = await driver.exportXML(100);
  } else if (currentDeviceKey === 'vetscan') {
    if (action.key === 'runAnalysis') {
      result = await driver.runAnalysis({
        patient_id: params.patient_id||'PAT-001',
        rotor_type: params.rotor_type||'canine',
        sample_type: params.sample_type||'whole_blood',
        model: readForm('connectionForm', ParamRegistry.vetscan.connectionParams).model||'vs2'
      }, pct => log.info(`Progress: ${pct}%`));
    } else if (action.key === 'getStatus') {
      result = await driver.getStatus();
    }
  }

  if (result !== undefined) {
    appendStreamData(result, 'response');
    log.success(`Response received for: ${action.label}`);
  }
}

// ── Human-readable renderers ───────────────────────────────────────────────

function renderHumanReadable(deviceKey, actionKey, data) {
  switch(deviceKey) {
    case 'orbbec':   return renderOrbbec(actionKey, data);
    case 'flir':     return renderFlir(actionKey, data);
    case 'clarius':  return renderClarius(actionKey, data);
    case 'vemo':     return renderVemo(actionKey, data);
    case 'tekscan':  return renderTekscan(actionKey, data);
    case 'vetscan':  return renderVetscan(actionKey, data);
    default: return `<pre style="font-size:11px;">${JSON.stringify(data,null,2)}</pre>`;
  }
}

function statRow(label, value, unit='', color='') {
  const valueStyle = color ? `color:${color};font-weight:700;` : 'font-weight:600;';
  return `<div style="display:flex;justify-content:space-between;align-items:center;
    padding:5px 0;border-bottom:1px solid var(--border);">
    <span style="color:var(--text-muted);font-size:12px;">${label}</span>
    <span style="font-size:13px;font-family:var(--font-mono);${valueStyle}">${value}<span style="color:var(--text-muted);font-size:10px;margin-left:3px;">${unit}</span></span>
  </div>`;
}

function statGrid(items) {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0;">
    ${items.map(([label,value,unit,color])=>`
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;">
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">${label}</div>
        <div style="font-size:15px;font-weight:700;font-family:var(--font-mono);${color?`color:${color}`:''}">${value} <span style="font-size:10px;font-weight:400;color:var(--text-muted);">${unit||''}</span></div>
      </div>`).join('')}
  </div>`;
}

function sectionTitle(t) {
  return `<div style="font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;
    color:var(--text-muted);margin:10px 0 4px;">${t}</div>`;
}

// ── ORBBEC ─────────────────────────────────────────────────────────────────
function renderOrbbec(actionKey, d) {
  if (actionKey === 'stream' || actionKey === 'frame') {
    const dep = d.depth || {}, col = d.color || {};
    return `
      ${sectionTitle('Frame Info')}
      ${statRow('Frame Number', d.frame_number, '')}
      ${statRow('Timestamp', d.timestamp_iso ? d.timestamp_iso.replace('T',' ').slice(0,19) : '—', '')}
      ${sectionTitle('Depth Stream')}
      ${statGrid([
        ['Resolution', `${dep.width||0}×${dep.height||0}`, 'px'],
        ['Frame Rate', dep.fps||'—', 'fps', '#58a6ff'],
        ['Min Depth',  dep.min_depth_mm||'—', 'mm'],
        ['Max Depth',  dep.max_depth_mm||'—', 'mm'],
        ['Avg Depth',  dep.avg_depth_mm||'—', 'mm', '#ffa657'],
        ['Scale',      dep.depth_scale_mm||1, 'mm/unit'],
      ])}
      ${sectionTitle('Color Stream')}
      ${statGrid([
        ['Resolution', `${col.width||0}×${col.height||0}`, 'px'],
        ['Frame Rate', col.fps||'—', 'fps', '#3fb950'],
        ['Format', col.format||'—', ''],
        ['Size', col.data_size_bytes ? Math.round(col.data_size_bytes/1024)+'KB' : '—', ''],
      ])}`;
  }
  if (actionKey === 'capturePointCloud') {
    return `
      ${sectionTitle('Point Cloud Capture')}
      ${statGrid([
        ['Total Points',  (d.total_points||0).toLocaleString(), '', '#58a6ff'],
        ['Valid Points',  (d.valid_points||0).toLocaleString(), '', '#3fb950'],
        ['Unit', d.unit||'mm', ''],
        ['Format', d.format||'—', ''],
      ])}
      ${sectionTitle('Bounding Box')}
      ${d.bounding_box ? `
        ${statRow('X Range', `${d.bounding_box.x?.[0]} → ${d.bounding_box.x?.[1]}`, 'mm')}
        ${statRow('Y Range', `${d.bounding_box.y?.[0]} → ${d.bounding_box.y?.[1]}`, 'mm')}
        ${statRow('Z Range', `${d.bounding_box.z?.[0]} → ${d.bounding_box.z?.[1]}`, 'mm')}
      ` : ''}
      ${sectionTitle('Sample Points (first 3)')}
      ${(d.sample_points||[]).slice(0,3).map((p,i)=>
        statRow(`Point ${i+1}`, `X:${p.x}  Y:${p.y}  Z:${p.z}`, 'mm')
      ).join('')}`;
  }
  if (actionKey === 'captureIMU') {
    const a = d.accelerometer||{}, g = d.gyroscope||{};
    return `
      ${sectionTitle('Accelerometer')}
      ${statGrid([
        ['X', a.x_g||0, 'g'],
        ['Y', a.y_g||0, 'g'],
        ['Z', a.z_g||0, 'g', '#3fb950'],
        ['Rate', a.sample_rate_hz||1600, 'Hz'],
      ])}
      ${sectionTitle('Gyroscope')}
      ${statGrid([
        ['X', g.x_dps||0, '°/s'],
        ['Y', g.y_dps||0, '°/s'],
        ['Z', g.z_dps||0, '°/s'],
        ['Rate', g.sample_rate_hz||1600, 'Hz'],
      ])}
      ${sectionTitle('Temperature')}
      ${statRow('Chip Temp', d.temperature_c, '°C', '#ffa657')}`;
  }
  return `<pre style="font-size:11px;">${JSON.stringify(d,null,2)}</pre>`;
}

// ── FLIR ───────────────────────────────────────────────────────────────────
function renderFlir(actionKey, d) {
  if (actionKey === 'getSpot') {
    const t = parseFloat(d.temperature||0);
    const color = t > 40 ? '#ff7b72' : t > 37 ? '#ffa657' : '#58a6ff';
    return `
      ${sectionTitle('Spot Temperature Measurement')}
      <div style="text-align:center;padding:16px 0 8px;">
        <div style="font-size:52px;font-weight:700;font-family:var(--font-mono);color:${color};">${t.toFixed(1)}</div>
        <div style="font-size:18px;color:var(--text-muted);margin-top:-4px;">°${d.unit||'C'}</div>
      </div>
      ${statRow('ROI Name', d.name||'—')}
      ${statRow('Pixel X', d.x, 'px')}
      ${statRow('Pixel Y', d.y, 'px')}
      ${statRow('Timestamp', d.timestamp ? d.timestamp.replace('T',' ').slice(0,19) : '—')}`;
  }
  if (actionKey === 'getBox') {
    const max = parseFloat(d.max||0), min = parseFloat(d.min||0), avg = parseFloat(d.avg||0);
    return `
      ${sectionTitle('Box ROI Temperature')}
      ${statGrid([
        ['Maximum', max.toFixed(1), `°${d.unit||'C'}`, '#ff7b72'],
        ['Average', avg.toFixed(1), `°${d.unit||'C'}`, '#ffa657'],
        ['Minimum', min.toFixed(1), `°${d.unit||'C'}`, '#58a6ff'],
        ['Spread',  (max-min).toFixed(1), `°${d.unit||'C'}`],
      ])}
      ${sectionTitle('Region')}
      ${d.area ? `
        ${statRow('Position', `(${d.area.x}, ${d.area.y})`, 'px')}
        ${statRow('Size', `${d.area.width} × ${d.area.height}`, 'px')}
      ` : ''}`;
  }
  if (actionKey === 'getLine') {
    const pts = d.points||[];
    const max = parseFloat(d.max||0), min = parseFloat(d.min||0);
    return `
      ${sectionTitle('Line Temperature Profile')}
      ${statGrid([
        ['Max Temp', max.toFixed(1), `°${d.unit||'C'}`, '#ff7b72'],
        ['Min Temp', min.toFixed(1), `°${d.unit||'C'}`, '#58a6ff'],
        ['Average',  parseFloat(d.avg||0).toFixed(1), `°${d.unit||'C'}`, '#ffa657'],
        ['Points',   pts.length, ''],
      ])}
      ${sectionTitle('Temperature Profile')}
      <div style="display:flex;align-items:flex-end;gap:2px;height:50px;margin:6px 0;">
        ${pts.slice(0,40).map(v=>{
          const h = Math.round(((v-min)/(max-min||1))*44)+4;
          const c = v > (max+avg)/2 ? '#ff7b72' : '#58a6ff';
          return `<div style="width:100%;background:${c};height:${h}px;border-radius:2px 2px 0 0;"></div>`;
        }).join('')}
      </div>`;
  }
  if (actionKey === 'getAlarms') {
    const alarms = d.alarms||[];
    return `
      ${sectionTitle('Alarm States')}
      ${alarms.map(a=>`
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:8px 10px;border-radius:6px;margin-bottom:6px;
          background:${a.triggered?'#3a1a1a':'var(--surface-2)'};
          border:1px solid ${a.triggered?'#ff7b72':'var(--border)'};">
          <div>
            <div style="font-weight:600;font-size:12px;">${a.name}</div>
            <div style="font-size:10px;color:var(--text-muted);">ROI: ${a.associatedROI} · Threshold: ${a.threshold}°${a.unit}</div>
          </div>
          <div style="font-size:18px;">${a.triggered ? '🔴' : '🟢'}</div>
        </div>`).join('')}`;
  }
  if (actionKey === 'getImage') {
    return `
      ${sectionTitle('Thermal Image')}
      ${statRow('Format', d.format, '')}
      ${statRow('Resolution', `${d.width||'?'} × ${d.height||'?'}`, 'px')}
      ${statRow('File Size', d.size_bytes ? Math.round(d.size_bytes/1024)+'KB' : '—', '')}
      ${statRow('Timestamp', d.timestamp_iso ? d.timestamp_iso.replace('T',' ').slice(0,19) : '—')}`;
  }
  return `<pre style="font-size:11px;">${JSON.stringify(d,null,2)}</pre>`;
}

// ── CLARIUS ────────────────────────────────────────────────────────────────
function renderClarius(actionKey, d) {
  if (actionKey === 'stream' || actionKey === 'frame') {
    const imu = d.imu||{}, acc = imu.accel||{}, gyro = imu.gyro||{};
    return `
      ${sectionTitle('Ultrasound Frame')}
      ${statGrid([
        ['Frame #',   d.frame_number||0, ''],
        ['Mode',      (d.imaging_mode||'').toUpperCase(), '', '#58a6ff'],
        ['Depth',     d.depth_cm||0, 'cm', '#3fb950'],
        ['Gain',      d.gain_pct||0, '%'],
        ['Size',      `${d.width||0}×${d.height||0}`, 'px'],
        ['bpp',       d.bits_per_pixel||8, 'bit'],
      ])}
      ${sectionTitle('IMU')}
      ${statGrid([
        ['Accel X', (acc.x||0).toFixed(3), 'g'],
        ['Accel Y', (acc.y||0).toFixed(3), 'g'],
        ['Accel Z', (acc.z||1).toFixed(3), 'g', '#3fb950'],
        ['Gyro Z',  (gyro.z||0).toFixed(3), '°/s'],
      ])}`;
  }
  if (actionKey === 'captureRawIQ') {
    return `
      ${sectionTitle('Raw IQ Data')}
      ${statGrid([
        ['Scan Lines',   d.lines||0, ''],
        ['Samples/Line', d.samples_per_line||0, ''],
        ['Data Size',    d.data_size_bytes ? Math.round(d.data_size_bytes/1024)+'KB' : '—', ''],
        ['Center Freq',  d.center_frequency_mhz||0, 'MHz', '#58a6ff'],
        ['Sample Rate',  d.sample_rate_mhz||0, 'MHz'],
        ['Axial Spacing',d.axial_spacing_mm||0, 'mm'],
      ])}
      ${sectionTitle('Depth Range')}
      ${statRow('Start', d.depth_start_mm, 'mm')}
      ${statRow('End',   d.depth_end_mm, 'mm')}`;
  }
  return `<pre style="font-size:11px;">${JSON.stringify(d,null,2)}</pre>`;
}

// ── VEMO ECG ───────────────────────────────────────────────────────────────
function renderVemo(actionKey, d) {
  if (actionKey === 'stream' || actionKey === 'packet') {
    const samples = d.samples_mv||[];
    const maxV = Math.max(...samples), minV = Math.min(...samples);
    const midY = 28;
    const scaleY = 18 / Math.max(Math.abs(maxV), Math.abs(minV), 0.5);
    const points = samples.map((v,i)=>{
      const x = Math.round((i/(samples.length-1))*200);
      const y = Math.round(midY - v * scaleY);
      return `${x},${y}`;
    }).join(' ');
    return `
      ${sectionTitle('ECG Packet')}
      ${statRow('Lead', `<strong style="font-size:15px;">${d.lead||'—'}</strong>`, '')}
      ${statRow('Sample Rate', d.sample_rate_hz, 'Hz')}
      ${statRow('Samples', samples.length, '')}
      ${statRow('Peak', maxV.toFixed(3), 'mV', '#ff7b72')}
      ${statRow('Trough', minV.toFixed(3), 'mV', '#58a6ff')}
      ${sectionTitle('Waveform')}
      <svg viewBox="0 0 200 56" style="width:100%;height:56px;background:#001a00;border-radius:4px;">
        <polyline points="${points}" fill="none" stroke="#00ff44" stroke-width="1.2"/>
      </svg>`;
  }
  if (actionKey === 'captureRecord') {
    const m = d.measurements||{}, interp = d.interpretation||{};
    const hr = m.heart_rate_bpm||0;
    const hrColor = hr < 60 ? '#58a6ff' : hr > 100 ? '#ff7b72' : '#3fb950';
    return `
      ${sectionTitle('Patient')}
      ${statRow('Record ID', d.record_id||'—')}
      ${statRow('Duration', d.duration_s, 's')}
      ${statRow('Sample Rate', d.sample_rate_hz, 'Hz')}
      ${statRow('Leads', (d.leads_captured||[]).join('  '))}
      ${sectionTitle('Measurements')}
      <div style="text-align:center;padding:12px 0 4px;">
        <div style="font-size:48px;font-weight:700;font-family:var(--font-mono);color:${hrColor};">${hr}</div>
        <div style="color:var(--text-muted);font-size:13px;">bpm</div>
      </div>
      ${statGrid([
        ['PR Interval',  m.pr_interval_ms||0, 'ms'],
        ['QRS Duration', m.qrs_duration_ms||0, 'ms'],
        ['QT Interval',  m.qt_interval_ms||0, 'ms'],
        ['QTc',          m.qtc_interval_ms||0, 'ms'],
        ['ST Deviation', (m.st_deviation_mv||0).toFixed(3), 'mV'],
        ['QRS Axis',     m.qrs_axis_deg||0, '°'],
      ])}
      ${sectionTitle('Interpretation')}
      <div style="padding:8px 10px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border);">
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${interp.rhythm||'—'}</div>
        <div style="font-size:11px;color:var(--text-muted);">Confidence: ${Math.round((interp.confidence||0)*100)}%</div>
        ${(interp.abnormalities||[]).length > 0
          ? `<div style="color:#ffa657;margin-top:4px;font-size:11px;">⚠️ ${interp.abnormalities.join(', ')}</div>`
          : `<div style="color:#3fb950;margin-top:4px;font-size:11px;">✓ No abnormalities detected</div>`}
      </div>`;
  }
  return `<pre style="font-size:11px;">${JSON.stringify(d,null,2)}</pre>`;
}

// ── TEKSCAN ────────────────────────────────────────────────────────────────
function renderTekscan(actionKey, d) {
  if (actionKey === 'stream' || actionKey === 'frame') {
    const peak = parseFloat(d.peak_force_N||0);
    const total = parseFloat(d.total_force_N||0);
    const cop = d.center_of_pressure||{};
    return `
      ${sectionTitle('Pressure Frame')}
      ${statGrid([
        ['Peak Force',  peak.toFixed(1), 'N', peak>15?'#ff7b72':'#3fb950'],
        ['Total Force', total.toFixed(1), 'N', '#ffa657'],
        ['Contact Area',parseFloat(d.contact_area_cm2||0).toFixed(1), 'cm²'],
        ['Active Cells',d.active_sensels||0, ''],
      ])}
      ${sectionTitle('Center of Pressure')}
      <div style="position:relative;background:var(--surface-2);border:1px solid var(--border);
        border-radius:6px;height:80px;margin:4px 0;overflow:hidden;">
        <div style="position:absolute;font-size:10px;color:var(--text-dim);top:4px;left:6px;">0</div>
        <div style="position:absolute;font-size:10px;color:var(--text-dim);top:4px;right:6px;">${d.cols||64}</div>
        <div style="position:absolute;font-size:10px;color:var(--text-dim);bottom:4px;left:6px;">${d.rows||48}</div>
        <div style="position:absolute;width:12px;height:12px;background:#ffa657;border-radius:50%;
          border:2px solid #fff;transform:translate(-50%,-50%);
          left:${Math.round((cop.x_sensel||0)/(d.cols||64)*100)}%;
          top:${Math.round((cop.y_sensel||0)/(d.rows||48)*100)}%;"></div>
      </div>
      ${statRow('CoP X', (cop.x_sensel||0).toFixed(1), 'sensel')}
      ${statRow('CoP Y', (cop.y_sensel||0).toFixed(1), 'sensel')}
      ${statRow('Calibration', d.calibration_n_per_raw, 'N/raw')}`;
  }
  if (actionKey === 'exportXML') {
    return `
      ${sectionTitle('Export')}
      ${statRow('Format', 'FScan XML')}
      ${statRow('Status', '✓ Export ready', '', '#3fb950')}`;
  }
  return `<pre style="font-size:11px;">${JSON.stringify(d,null,2)}</pre>`;
}

// ── VETSCAN ────────────────────────────────────────────────────────────────
function renderVetscan(actionKey, d) {
  if (actionKey === 'runAnalysis') {
    const analytes = d.analytes||[];
    const flagColors = { H:'#ff7b72', L:'#58a6ff', N:'#3fb950' };
    const sum = d.summary||{};
    return `
      ${sectionTitle('Patient & Run')}
      ${statRow('Patient ID', d.patient_id||'—')}
      ${statRow('Device', d.device||'—')}
      ${statRow('Rotor', d.rotor_type||'—')}
      ${statRow('Sample', d.sample_type||'—')}
      ${statRow('QC', d.qc_passed ? '✓ Passed' : '✗ Failed', '', d.qc_passed?'#3fb950':'#ff7b72')}
      ${sectionTitle('Summary')}
      ${statGrid([
        ['Normal',   sum.normal||0, 'analytes', '#3fb950'],
        ['Abnormal', sum.abnormal||0, 'analytes', (sum.abnormal||0)>0?'#ff7b72':'#3fb950'],
        ['Total',    sum.total||0, 'analytes'],
        ['Status',   d.status||'—', ''],
      ])}
      ${sectionTitle('Analyte Results')}
      <div style="font-size:11px;">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:0;
          font-weight:700;color:var(--text-muted);padding:4px 6px;
          border-bottom:1px solid var(--border);">
          <span>Analyte</span><span style="text-align:right;">Value</span><span style="text-align:right;">Ref Range</span><span style="text-align:center;">Flag</span>
        </div>
        ${analytes.map(a=>`
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:0;
            padding:5px 6px;border-bottom:1px solid var(--border);
            background:${a.flag!=='N'?'rgba(255,123,114,0.05)':'transparent'}">
            <span>${a.name}</span>
            <span style="text-align:right;font-family:var(--font-mono);font-weight:700;
              color:${flagColors[a.flag]||'var(--text)'};">${a.value}</span>
            <span style="text-align:right;color:var(--text-muted);">${a.reference_range?a.reference_range[0]+'-'+a.reference_range[1]:''} <span style="color:var(--text-dim)">${a.unit}</span></span>
            <span style="text-align:center;font-weight:700;color:${flagColors[a.flag]||'var(--text)'};">${a.flag}</span>
          </div>`).join('')}
      </div>`;
  }
  if (actionKey === 'getStatus') {
    const stateColor = d.state==='Ready' ? '#3fb950' : d.state==='Running' ? '#ffa657' : '#ff7b72';
    return `
      ${sectionTitle('Analyzer Status')}
      ${statRow('Device',      d.device||'—')}
      ${statRow('State',       d.state||'—', '', stateColor)}
      ${statRow('Temperature', d.temperature_c, '°C', '#ffa657')}
      ${statRow('Rotors Used', d.rotor_count, '')}
      ${statRow('Last QC',     d.last_qc ? d.last_qc.replace('T',' ').slice(0,16) : '—')}
      ${statRow('Errors', (d.errors||[]).length===0 ? '✓ None' : d.errors.join(', '), '', (d.errors||[]).length>0?'#ff7b72':'#3fb950')}`;
  }
  return `<pre style="font-size:11px;">${JSON.stringify(d,null,2)}</pre>`;
}

// ── Stream data display (human-readable) ───────────────────────────────────
function appendStreamData(data, type) {
  streamCount++;
  const empty = document.getElementById('streamEmpty');
  const stream = document.getElementById('streamData');
  empty.style.display = 'none';
  stream.style.display = 'block';

  const def = currentDeviceKey ? ParamRegistry[currentDeviceKey] : null;
  const actionKey = currentAction?.key || type;

  const item = document.createElement('div');
  item.className = 'data-item';
  item.innerHTML = `
    <div class="data-timestamp" style="margin-bottom:8px;">
      <span style="font-size:13px;">${def?.icon||'📦'} ${def?.label||'Device'}</span>
      &nbsp;·&nbsp; #${streamCount} &nbsp;·&nbsp; ${new Date().toLocaleTimeString()}
      &nbsp;·&nbsp; <span style="color:var(--blue-light);">${currentAction?.label||type}</span>
    </div>
    ${renderHumanReadable(currentDeviceKey, actionKey, data)}`;

  stream.insertBefore(item, stream.firstChild);
  while (stream.children.length > 20) stream.removeChild(stream.lastChild);
}

// ── Schema renderer ────────────────────────────────────────────────────────
function renderSchema(schema, depth) {
  depth = depth || 0;
  if (depth === 0) {
    document.getElementById('schemaContent').innerHTML = buildSchemaHTML(schema, 0);
  }
}

function buildSchemaHTML(schema, depth) {
  if (!schema || typeof schema !== 'object') return '';
  let html = depth > 0 ? '<div class="schema-indent">' : '<div>';
  Object.entries(schema).forEach(([key, def]) => {
    if (key === '_desc') return;
    if (def.type) {
      html += `<div style="padding:3px 0;">
        <span class="schema-key">${key}</span>
        <span class="schema-type"> : ${def.type}</span>
        ${def.unit  ? `<span style="color:#7ee787;font-size:10px;"> [${def.unit}]</span>` : ''}
        ${def.desc  ? `<span class="schema-desc">  — ${def.desc}</span>` : ''}
      </div>`;
    } else {
      // Nested object
      html += `<div style="padding:3px 0;"><span class="schema-key">${key}</span> <span class="schema-type">: {</span></div>`;
      html += buildSchemaHTML(def, depth + 1);
      html += `<div><span class="schema-type">}</span></div>`;
    }
  });
  html += '</div>';
  return html;
}

function clearStream() {
  streamCount = 0;
  document.getElementById('streamEmpty').style.display = 'block';
  document.getElementById('streamData').style.display = 'none';
  document.getElementById('streamData').innerHTML = '';
}

// Init
injectModeIndicator('flir'); // generic — shows global mode

// ── Multi-Device Dashboard Functions ──────────────────────────────────────

function addDashboardCard(deviceKey) {
  const def = activeSensors[deviceKey].def;
  const grid = document.getElementById('dashboardGrid');
  const empty = document.getElementById('dashboardEmpty');
  
  empty.style.display = 'none';
  grid.style.display = 'grid';
  
  const card = document.createElement('div');
  card.className = 'device-stream-card';
  card.id = `dashboard-${deviceKey}`;
  card.innerHTML = `
    <div class="device-stream-header">
      <div class="title">
        <span class="icon">${def.icon}</span>
        <span>${def.label}</span>
        <span class="badge-streaming">LIVE</span>
      </div>
      <div class="controls">
        <button onclick="togglePauseSensor('${deviceKey}')">⏸</button>
        <button onclick="clearSensorData('${deviceKey}')">🗑</button>
      </div>
    </div>
    <div class="device-stream-body" id="dashboard-body-${deviceKey}">
      <p class="text-muted" style="font-size:10px;">Waiting for data...</p>
    </div>
    <div class="device-stream-footer">
      <span id="dashboard-count-${deviceKey}">0 frames</span>
      <span id="dashboard-rate-${deviceKey}">—</span>
    </div>
  `;
  grid.appendChild(card);
}

function removeDashboardCard(deviceKey) {
  const card = document.getElementById(`dashboard-${deviceKey}`);
  if (card) card.remove();
  
  // If no more sensors, show empty state
  if (Object.keys(activeSensors).length === 0) {
    document.getElementById('dashboardEmpty').style.display = 'block';
    document.getElementById('dashboardGrid').style.display = 'none';
  }
}

function updateDashboard(deviceKey, data, type) {
  const sensor = activeSensors[deviceKey];
  if (!sensor || sensor.paused || dashboardPausedAll) return;

  sensor.count++;
  sensor.lastData = data;

  const body = document.getElementById(`dashboard-body-${deviceKey}`);
  if (!body) return;

  // Replace body content with latest reading (dashboard shows latest only, not history)
  const actionKey = sensor.currentActionKey || type;
  body.innerHTML = renderDashboardCard(deviceKey, actionKey, data, sensor.count);

  document.getElementById(`dashboard-count-${deviceKey}`).textContent = `${sensor.count} frames received`;
  document.getElementById(`dashboard-rate-${deviceKey}`).textContent = `Last update: ${new Date().toLocaleTimeString()}`;
}

function renderDashboardCard(deviceKey, actionKey, data, count) {
  switch(deviceKey) {
    case 'orbbec': {
      const dep = data.depth||{}, col = data.color||{};
      return `
        ${miniStatGrid([
          ['Frame #',   data.frame_number||count],
          ['Depth FPS', (dep.fps||0)+' fps'],
          ['Avg Depth', Math.round(dep.avg_depth_mm||0)+' mm'],
          ['Min Depth', Math.round(dep.min_depth_mm||0)+' mm'],
          ['Max Depth', Math.round(dep.max_depth_mm||0)+' mm'],
          ['Color',     `${col.width||0}×${col.height||0}`],
        ])}`;
    }
    case 'flir': {
      const t = parseFloat(data.temperature||0);
      const color = t>40?'#ff7b72':t>37?'#ffa657':'#58a6ff';
      if (data.temperature !== undefined) return `
        <div style="text-align:center;padding:10px 0;">
          <div style="font-size:42px;font-weight:700;font-family:var(--font-mono);color:${color};">${t.toFixed(1)}</div>
          <div style="color:var(--text-muted);">°${data.unit||'C'} · ${data.name||'Spot'}</div>
        </div>`;
      if (data.max !== undefined) return `
        ${miniStatGrid([
          ['Max', parseFloat(data.max).toFixed(1)+`°${data.unit||'C'}`],
          ['Min', parseFloat(data.min).toFixed(1)+`°${data.unit||'C'}`],
          ['Avg', parseFloat(data.avg).toFixed(1)+`°${data.unit||'C'}`],
          ['Region', data.name||'Box'],
        ])}`;
      if (data.alarms) return `
        ${(data.alarms||[]).map(a=>`<div style="display:flex;justify-content:space-between;padding:4px 6px;
          border-radius:4px;background:${a.triggered?'rgba(255,123,114,0.1)':'var(--surface-2)'};
          margin-bottom:4px;font-size:11px;">
          <span>${a.name}</span><span>${a.triggered?'🔴 ACTIVE':'🟢 OK'}</span></div>`).join('')}`;
      return `${miniStatGrid([['Format',data.format],['Size',Math.round((data.size_bytes||0)/1024)+'KB']])}`;
    }
    case 'clarius': {
      const imu = data.imu||{};
      return `
        ${miniStatGrid([
          ['Frame #', data.frame_number||count],
          ['Mode',    (data.imaging_mode||'').toUpperCase()],
          ['Depth',   (data.depth_cm||0)+' cm'],
          ['Gain',    (data.gain_pct||0)+'%'],
          ['Accel Z', ((imu.accel||{}).z||0).toFixed(2)+' g'],
          ['Size',    `${data.width||0}×${data.height||0}`],
        ])}`;
    }
    case 'vemo': {
      const samples = data.samples_mv||[];
      const maxV = samples.length ? Math.max(...samples) : 0;
      const minV = samples.length ? Math.min(...samples) : 0;
      const midY = 24, scaleY = 16 / Math.max(Math.abs(maxV), Math.abs(minV), 0.5);
      const pts = samples.map((v,i)=>`${Math.round(i/(samples.length-1)*180)},${Math.round(midY-v*scaleY)}`).join(' ');
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:20px;font-weight:700;font-family:var(--font-mono);color:#3fb950;">Lead ${data.lead||'—'}</span>
          <span style="font-size:11px;color:var(--text-muted);">${data.sample_rate_hz||500} Hz</span>
        </div>
        <svg viewBox="0 0 180 48" style="width:100%;height:40px;background:#001a00;border-radius:4px;">
          <polyline points="${pts}" fill="none" stroke="#00ff44" stroke-width="1.2"/>
        </svg>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--text-muted);">
          <span>Peak: ${maxV.toFixed(2)} mV</span><span>Trough: ${minV.toFixed(2)} mV</span>
        </div>`;
    }
    case 'tekscan': {
      const peak = parseFloat(data.peak_force_N||0);
      const cop = data.center_of_pressure||{};
      return `
        ${miniStatGrid([
          ['Peak Force',  peak.toFixed(1)+' N'],
          ['Total Force', parseFloat(data.total_force_N||0).toFixed(1)+' N'],
          ['Contact Area',parseFloat(data.contact_area_cm2||0).toFixed(1)+' cm²'],
          ['Active Cells',data.active_sensels||0],
          ['CoP X',       (cop.x_sensel||0).toFixed(1)],
          ['CoP Y',       (cop.y_sensel||0).toFixed(1)],
        ])}`;
    }
    case 'vetscan': {
      const analytes = data.analytes||[];
      const abnormal = analytes.filter(a=>a.flag!=='N');
      return `
        ${miniStatGrid([
          ['Status', data.status||'—'],
          ['QC', data.qc_passed?'✓ Passed':'✗ Failed'],
          ['Normal', analytes.filter(a=>a.flag==='N').length+' / '+analytes.length],
          ['Flagged', abnormal.length||'0'],
        ])}
        ${abnormal.length ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted);">
          Flagged: ${abnormal.map(a=>`<span style="color:${a.flag==='H'?'#ff7b72':'#58a6ff'}">${a.name} (${a.flag})</span>`).join(', ')}
        </div>` : ''}`;
    }
    default: return `<p style="font-size:11px;color:var(--text-muted);">Data received</p>`;
  }
}

function miniStatGrid(items) {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
    ${items.map(([label,value])=>`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 7px;">
        <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">${label}</div>
        <div style="font-size:12px;font-weight:600;font-family:var(--font-mono);margin-top:1px;">${value}</div>
      </div>`).join('')}
  </div>`;
}

function togglePauseSensor(deviceKey) {
  const sensor = activeSensors[deviceKey];
  if (!sensor) return;
  sensor.paused = !sensor.paused;
  
  const card = document.getElementById(`dashboard-${deviceKey}`);
  const badge = card.querySelector('.badge-streaming, .badge-paused');
  if (sensor.paused) {
    badge.className = 'badge-paused';
    badge.textContent = 'PAUSED';
  } else {
    badge.className = 'badge-streaming';
    badge.textContent = 'LIVE';
  }
}

function clearSensorData(deviceKey) {
  const sensor = activeSensors[deviceKey];
  if (!sensor) return;
  sensor.count = 0;
  const body = document.getElementById(`dashboard-body-${deviceKey}`);
  if (body) body.innerHTML = '<p class="text-muted" style="font-size:10px;">Cleared.</p>';
  document.getElementById(`dashboard-count-${deviceKey}`).textContent = '0 frames';
}

function togglePauseAll() {
  dashboardPausedAll = !dashboardPausedAll;
  const btn = document.getElementById('pauseAllBtn');
  btn.textContent = dashboardPausedAll ? '▶ Resume All' : '⏸ Pause All';
  
  // Update all badges
  Object.keys(activeSensors).forEach(key => {
    const card = document.getElementById(`dashboard-${key}`);
    if (!card) return;
    const badge = card.querySelector('.badge-streaming, .badge-paused');
    if (dashboardPausedAll) {
      badge.className = 'badge-paused';
      badge.textContent = 'PAUSED';
    } else {
      badge.className = 'badge-streaming';
      badge.textContent = 'LIVE';
    }
  });
}

function clearAllDashboard() {
  Object.keys(activeSensors).forEach(key => clearSensorData(key));
}
