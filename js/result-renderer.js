/**
 * js/result-renderer.js
 * Renders sensor results as beautiful human-readable UI cards.
 * Used by all 6 device pages. No JSON, no code blocks.
 */

/* ── Primitives ─────────────────────────────────────────────────────────── */

function R_statRow(label, value, unit='', valueColor='') {
  return `<div style="display:flex;justify-content:space-between;align-items:center;
      padding:7px 0;border-bottom:1px solid var(--border);">
    <span style="font-size:12px;color:var(--text-muted);">${label}</span>
    <span style="font-size:13px;font-weight:600;font-family:var(--font-mono);
      ${valueColor?`color:${valueColor}`:''}">${value}
      ${unit?`<span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:2px;">${unit}</span>`:''}
    </span></div>`;
}

function R_bigNumber(value, unit, label, color='var(--text)') {
  return `<div style="text-align:center;padding:14px 0 8px;">
    <div style="font-size:52px;font-weight:700;font-family:var(--font-mono);color:${color};line-height:1;">${value}</div>
    <div style="font-size:16px;color:var(--text-muted);margin-top:4px;">${unit}</div>
    ${label?`<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${label}</div>`:''}
  </div>`;
}

function R_grid(items) {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0;">
    ${items.map(([label,value,unit='',color=''])=>`
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:9px 11px;">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">${label}</div>
        <div style="font-size:15px;font-weight:700;font-family:var(--font-mono);${color?`color:${color}`:''}">
          ${value}<span style="font-size:10px;font-weight:400;color:var(--text-muted);margin-left:3px;">${unit}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

function R_section(title) {
  return `<div style="font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;
    color:var(--text-muted);margin:14px 0 6px;padding-top:8px;border-top:1px solid var(--border);">${title}</div>`;
}

function R_badge(text, bg, color) {
  return `<span style="background:${bg};color:${color};font-size:10px;font-weight:700;
    padding:2px 8px;border-radius:10px;">${text}</span>`;
}

function R_alertCard(text, ok) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;
    padding:8px 12px;border-radius:6px;margin-bottom:6px;
    background:${ok?'var(--surface-2)':'rgba(218,54,51,0.08)'};
    border:1px solid ${ok?'var(--border)':'#da3633'};">
    <span style="font-size:12px;">${text}</span>
    <span style="font-size:16px;">${ok?'🟢':'🔴'}</span>
  </div>`;
}

function R_wrap(content) {
  return `<div style="padding:16px 20px;">${content}</div>`;
}

/* ── ORBBEC FEMTO MEGA ──────────────────────────────────────────────────── */

function renderOrbbecFrame(d) {
  const dep = d.depth||{}, col = d.color||{}, ir = d.ir||{};
  return R_wrap(`
    ${R_section('Frame Info')}
    ${R_grid([
      ['Frame #',    d.frame_number||'—', '', '#58a6ff'],
      ['Timestamp',  d.timestamp_iso ? d.timestamp_iso.slice(11,19) : '—'],
    ])}

    ${R_section('Depth Stream (Y16 · uint16)')}
    ${R_grid([
      ['Resolution',  `${dep.width||0}×${dep.height||0}`, 'px'],
      ['Frame Rate',  dep.fps||'—', 'fps', '#3fb950'],
      ['Min Depth',   dep.min_depth_mm||'—', 'mm'],
      ['Avg Depth',   dep.avg_depth_mm ? Math.round(dep.avg_depth_mm) : '—', 'mm', '#ffa657'],
      ['Max Depth',   dep.max_depth_mm||'—', 'mm'],
      ['Scale',       dep.depth_scale_mm||1, 'mm/unit'],
    ])}

    ${R_section('Color Stream (RGB888)')}
    ${R_grid([
      ['Resolution', `${col.width||0}×${col.height||0}`, 'px'],
      ['Frame Rate', col.fps||'—', 'fps', '#3fb950'],
      ['Format',     col.format||'RGB888'],
      ['Data Size',  col.data_size_bytes ? Math.round(col.data_size_bytes/1024/1024*10)/10 : '—', 'MB'],
    ])}

    ${R_section('IR / Sync')}
    ${R_grid([
      ['IR Size',     `${ir.width||0}×${ir.height||0}`, 'px'],
      ['HW Sync',     d.sync?.hardware_sync ? '✓ Enabled' : '—', '', '#3fb950'],
      ['D/C Offset',  d.sync?.depth_color_offset_us||'—', 'µs'],
      ['IR Format',   ir.format||'Y16'],
    ])}
  `);
}

function renderOrbbecPointCloud(d) {
  const bb = d.bounding_box||{};
  const pct = d.total_points ? Math.round(d.valid_points/d.total_points*100) : 0;
  return R_wrap(`
    ${R_section('Point Cloud Summary')}
    ${R_grid([
      ['Total Points',  (d.total_points||0).toLocaleString(), '', '#58a6ff'],
      ['Valid Points',  (d.valid_points||0).toLocaleString(), '', '#3fb950'],
      ['Coverage',      pct, '%', pct>80?'#3fb950':'#ffa657'],
      ['Format',        d.format||'XYZ_float32'],
      ['Unit',          d.unit||'mm'],
      ['Coord System',  'Right-hand'],
    ])}

    ${R_section('Bounding Box')}
    ${R_statRow('X Range', `${bb.x?.[0]} → ${bb.x?.[1]}`, 'mm')}
    ${R_statRow('Y Range', `${bb.y?.[0]} → ${bb.y?.[1]}`, 'mm')}
    ${R_statRow('Z Range', `${bb.z?.[0]} → ${bb.z?.[1]}`, 'mm')}

    ${R_section('Sample Points')}
    ${(d.sample_points||[]).slice(0,5).map((p,i)=>
      R_statRow(`Point ${i+1}`, `X: ${p.x}  Y: ${p.y}  Z: ${p.z}`, 'mm')
    ).join('')}

    ${R_section('Export Formats')}
    <div style="display:flex;gap:6px;margin-top:4px;">
      ${(d.file_formats||['PLY','PCD','CSV']).map(f=>R_badge(f,'var(--surface-2)','var(--text-muted)')).join('')}
    </div>
  `);
}

function renderOrbbecIMU(d) {
  const a = d.accelerometer||{}, g = d.gyroscope||{};
  return R_wrap(`
    ${R_section('Accelerometer')}
    ${R_grid([
      ['X', a.x_g||0, 'g'],
      ['Y', a.y_g||0, 'g'],
      ['Z', a.z_g||0, 'g', Math.abs(a.z_g-1)<0.05?'#3fb950':'#ffa657'],
      ['Sample Rate', a.sample_rate_hz||1600, 'Hz'],
    ])}

    ${R_section('Gyroscope')}
    ${R_grid([
      ['X', g.x_dps||0, '°/s'],
      ['Y', g.y_dps||0, '°/s'],
      ['Z', g.z_dps||0, '°/s'],
      ['Sample Rate', g.sample_rate_hz||1600, 'Hz'],
    ])}

    ${R_section('Temperature')}
    ${R_bigNumber(d.temperature_c||'—', '°C', 'IMU Chip Temperature', '#ffa657')}
  `);
}

/* ── FLIR THERMAL ───────────────────────────────────────────────────────── */

function renderFlirSpot(d) {
  const t = parseFloat(d.temperature||0);
  const color = t>41?'#ff7b72':t>38?'#ffa657':'#58a6ff';
  return R_wrap(`
    ${R_bigNumber(t.toFixed(1), `°${d.unit||'C'}`, d.name||'Spot Measurement', color)}
    ${R_section('Location')}
    ${R_statRow('ROI Name',  d.name||'—')}
    ${R_statRow('Pixel X',   d.x||'—', 'px')}
    ${R_statRow('Pixel Y',   d.y||'—', 'px')}
    ${R_statRow('Timestamp', d.timestamp ? d.timestamp.replace('T',' ').slice(0,19) : '—')}
  `);
}

function renderFlirBox(d) {
  const mx=parseFloat(d.max||0), mn=parseFloat(d.min||0), avg=parseFloat(d.avg||0);
  return R_wrap(`
    ${R_section('Temperature Statistics')}
    ${R_grid([
      ['Maximum', mx.toFixed(1), `°${d.unit||'C'}`, '#ff7b72'],
      ['Average', avg.toFixed(1), `°${d.unit||'C'}`, '#ffa657'],
      ['Minimum', mn.toFixed(1), `°${d.unit||'C'}`, '#58a6ff'],
      ['Spread',  (mx-mn).toFixed(1), `°${d.unit||'C'}`],
    ])}
    ${R_section('Region of Interest')}
    ${R_statRow('Name', d.name||'—')}
    ${d.area ? `
      ${R_statRow('Position', `(${d.area.x}, ${d.area.y})`, 'px')}
      ${R_statRow('Size', `${d.area.width} × ${d.area.height}`, 'px')}
    ` : ''}
    ${R_statRow('Timestamp', d.timestamp ? d.timestamp.replace('T',' ').slice(0,19) : '—')}
  `);
}

function renderFlirAlarms(d) {
  const alarms = d.alarms||[];
  const active = alarms.filter(a=>a.triggered).length;
  return R_wrap(`
    ${R_section('Alarm Overview')}
    ${R_grid([
      ['Total Alarms',  alarms.length, ''],
      ['Active',        active, '', active>0?'#ff7b72':'#3fb950'],
    ])}
    ${R_section('Alarm States')}
    ${alarms.map(a=>`
      <div style="border:1px solid ${a.triggered?'#da3633':'var(--border)'};border-radius:8px;
        padding:10px 14px;margin-bottom:8px;background:${a.triggered?'rgba(218,54,51,0.08)':'var(--surface-2)'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:600;font-size:13px;">${a.name}</span>
          <span style="font-size:20px;">${a.triggered?'🔴':'🟢'}</span>
        </div>
        ${R_statRow('State', a.state||'—', '', a.triggered?'#ff7b72':'#3fb950')}
        ${R_statRow('Threshold', a.threshold, `°${a.unit||'C'}`)}
        ${R_statRow('ROI', a.associatedROI||'—')}
      </div>`).join('')}
  `);
}

/* ── CLARIUS ULTRASOUND ─────────────────────────────────────────────────── */

function renderClariusFrame(d) {
  const imu = d.imu||{}, acc = imu.accel||{}, gyro = imu.gyro||{};
  return R_wrap(`
    ${R_section('Ultrasound Frame')}
    ${R_grid([
      ['Frame #',   d.frame_number||'—', '', '#58a6ff'],
      ['Mode',      (d.imaging_mode||'bmode').toUpperCase(), '', '#3fb950'],
      ['Depth',     d.depth_cm||'—', 'cm'],
      ['Gain',      d.gain_pct||'—', '%'],
      ['Resolution',`${d.width||0}×${d.height||0}`, 'px'],
      ['Bit Depth', d.bits_per_pixel||8, 'bpp'],
    ])}
    ${R_section('IMU — Accelerometer')}
    ${R_grid([
      ['X', (acc.x||0).toFixed(3), 'g'],
      ['Y', (acc.y||0).toFixed(3), 'g'],
      ['Z', (acc.z||0).toFixed(3), 'g', Math.abs((acc.z||0)-1)<0.05?'#3fb950':'#ffa657'],
      ['Gyro Z', (gyro.z||0).toFixed(3), '°/s'],
    ])}
  `);
}

function renderClariusRawIQ(d) {
  return R_wrap(`
    ${R_section('Raw IQ Data')}
    ${R_grid([
      ['Scan Lines',   d.lines||0, ''],
      ['Samples/Line', d.samples_per_line||0, ''],
      ['Total Samples',(d.lines||0)*(d.samples_per_line||0), ''],
      ['Data Size',    d.data_size_bytes ? Math.round(d.data_size_bytes/1024)+'KB' : '—', ''],
    ])}
    ${R_section('Frequency & Sampling')}
    ${R_grid([
      ['Center Freq',   d.center_frequency_mhz||'—', 'MHz', '#58a6ff'],
      ['Sample Rate',   d.sample_rate_mhz||'—', 'MHz'],
      ['Lateral Pitch', d.lateral_spacing_mm||'—', 'mm'],
      ['Axial Pitch',   d.axial_spacing_mm||'—', 'mm'],
    ])}
    ${R_section('Depth Coverage')}
    ${R_statRow('Start', d.depth_start_mm||0, 'mm')}
    ${R_statRow('End', d.depth_end_mm||'—', 'mm')}
    ${R_statRow('Format', 'IQ pairs · float32 · [I₀Q₀ I₁Q₁ ...]')}
  `);
}

/* ── BIONET VEMO ECG ────────────────────────────────────────────────────── */

function renderVemoRecord(d) {
  const m = d.measurements||{}, interp = d.interpretation||{};
  const hr = m.heart_rate_bpm||0;
  const hrColor = hr<60?'#58a6ff':hr>120?'#ff7b72':'#3fb950';
  return R_wrap(`
    ${R_section('Recording Info')}
    ${R_statRow('Record ID', d.record_id||'—')}
    ${R_statRow('Species', d.species||'—')}
    ${R_statRow('Duration', d.duration_s, 's')}
    ${R_statRow('Sample Rate', d.sample_rate_hz, 'Hz')}
    ${R_statRow('Leads', (d.leads_captured||[]).join('  '))}

    ${R_section('Heart Rate')}
    ${R_bigNumber(hr, 'bpm', '', hrColor)}

    ${R_section('Interval Measurements')}
    ${R_grid([
      ['PR Interval',  m.pr_interval_ms||'—', 'ms'],
      ['QRS Duration', m.qrs_duration_ms||'—', 'ms'],
      ['QT Interval',  m.qt_interval_ms||'—', 'ms'],
      ['QTc',          m.qtc_interval_ms||'—', 'ms'],
      ['ST Deviation', (m.st_deviation_mv||0).toFixed(3), 'mV'],
      ['QRS Axis',     m.qrs_axis_deg||'—', '°'],
    ])}

    ${R_section('Interpretation')}
    <div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;background:var(--surface-2);">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px;">${interp.rhythm||'—'}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">
        Confidence: <strong style="color:var(--text);">${Math.round((interp.confidence||0)*100)}%</strong>
      </div>
      ${(interp.abnormalities||[]).length>0
        ? `<div style="color:#ffa657;font-size:12px;">⚠️ ${interp.abnormalities.join(', ')}</div>`
        : `<div style="color:#3fb950;font-size:12px;">✓ No abnormalities detected</div>`}
    </div>
  `);
}

function renderVemoAnalysis(d) {
  return renderVemoRecord(d);
}

/* ── TEKSCAN GAIT ───────────────────────────────────────────────────────── */

function renderTekscanFrame(d) {
  const cop = d.center_of_pressure||{};
  const peak = parseFloat(d.peak_force_N||0);
  const peakColor = peak>20?'#ff7b72':peak>10?'#ffa657':'#3fb950';
  const copXpct = Math.round((cop.x_sensel||0)/(d.cols||64)*100);
  const copYpct = Math.round((cop.y_sensel||0)/(d.rows||48)*100);
  return R_wrap(`
    ${R_section('Force Measurements')}
    ${R_grid([
      ['Peak Force',   peak.toFixed(1), 'N', peakColor],
      ['Total Force',  parseFloat(d.total_force_N||0).toFixed(1), 'N', '#ffa657'],
      ['Contact Area', parseFloat(d.contact_area_cm2||0).toFixed(2), 'cm²'],
      ['Active Cells', d.active_sensels||0, ''],
    ])}

    ${R_section('Center of Pressure')}
    <div style="position:relative;background:var(--surface-2);border:1px solid var(--border);
      border-radius:8px;height:90px;margin:6px 0;overflow:hidden;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;
        justify-content:center;color:var(--text-dim);font-size:10px;">Pressure Mat</div>
      <div style="position:absolute;font-size:9px;color:var(--text-dim);top:4px;left:6px;">0,0</div>
      <div style="position:absolute;font-size:9px;color:var(--text-dim);top:4px;right:6px;">${d.cols||64}</div>
      <div style="position:absolute;font-size:9px;color:var(--text-dim);bottom:4px;left:6px;">${d.rows||48}</div>
      <div style="position:absolute;width:14px;height:14px;background:#ffa657;
        border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px rgba(255,165,55,.5);
        transform:translate(-50%,-50%);left:${copXpct}%;top:${copYpct}%;
        transition:left .2s,top .2s;"></div>
    </div>
    ${R_statRow('CoP X', (cop.x_sensel||0).toFixed(2), 'sensel')}
    ${R_statRow('CoP Y', (cop.y_sensel||0).toFixed(2), 'sensel')}

    ${R_section('Sensor Info')}
    ${R_statRow('Matrix', `${d.rows||48} × ${d.cols||64}`, 'sensels')}
    ${R_statRow('Calibration', d.calibration_n_per_raw||'—', 'N/raw')}
    ${R_statRow('Frame ID', d.frame_id||'—')}
    ${R_statRow('Timestamp', d.timestamp_iso ? d.timestamp_iso.slice(11,19) : '—')}
  `);
}

/* ── VETSCAN BLOOD ──────────────────────────────────────────────────────── */

function renderVetscanResults(d) {
  const analytes = d.analytes||[];
  const sum = d.summary||{};
  const flagColor = {H:'#ff7b72', L:'#58a6ff', N:'#3fb950'};
  return R_wrap(`
    ${R_section('Run Summary')}
    ${R_grid([
      ['Patient',  d.patient_id||'—'],
      ['Device',   d.device||'—'],
      ['Sample',   d.sample_type||'—'],
      ['Rotor',    d.rotor_type||'—'],
      ['QC',       d.qc_passed?'✓ Passed':'✗ Failed','', d.qc_passed?'#3fb950':'#ff7b72'],
      ['Status',   d.status||'—','', d.status==='completed'?'#3fb950':'#ffa657'],
    ])}

    ${R_section('Result Overview')}
    ${R_grid([
      ['Normal',   sum.normal||0, 'analytes', '#3fb950'],
      ['Flagged',  sum.abnormal||0, 'analytes', (sum.abnormal||0)>0?'#ff7b72':'#3fb950'],
    ])}

    ${R_section('Analyte Results')}
    <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:2fr 1.2fr 1.4fr 36px;
        padding:6px 12px;background:var(--surface-2);
        font-size:10px;font-weight:700;color:var(--text-muted);
        text-transform:uppercase;letter-spacing:.4px;">
        <span>Analyte</span><span style="text-align:right;">Value</span>
        <span style="text-align:right;">Reference</span><span style="text-align:center;">Flag</span>
      </div>
      ${analytes.map((a,i)=>`
        <div style="display:grid;grid-template-columns:2fr 1.2fr 1.4fr 36px;
          padding:7px 12px;border-top:1px solid var(--border);
          background:${a.flag!=='N'?'rgba(255,123,114,0.04)':'transparent'};
          align-items:center;">
          <span style="font-size:12px;">${a.name}</span>
          <span style="text-align:right;font-weight:700;font-size:13px;font-family:var(--font-mono);
            color:${flagColor[a.flag]||'var(--text)'};">${parseFloat(a.value).toFixed(2)}</span>
          <span style="text-align:right;font-size:11px;color:var(--text-muted);">
            ${a.reference_range?a.reference_range[0]+'–'+a.reference_range[1]:''} <span style="color:var(--text-dim)">${a.unit||''}</span>
          </span>
          <span style="text-align:center;font-weight:700;font-size:12px;
            color:${flagColor[a.flag]||'var(--text)'};">${a.flag}</span>
        </div>`).join('')}
    </div>
  `);
}

function renderVetscanASTM(d) {
  const analytes = d.analytes||[];
  return R_wrap(`
    ${R_section('ASTM E1394 Message')}
    ${R_statRow('Message Type', 'Result (R) Record')}
    ${R_statRow('Patient ID', d.patient_id||'—')}
    ${R_statRow('Run ID', d.run_id||'—')}
    ${R_statRow('Device', d.device||'—')}
    ${R_statRow('Timestamp', d.timestamp_iso ? d.timestamp_iso.replace('T',' ').slice(0,19) : '—')}

    ${R_section('Encoded Records')}
    <div style="font-family:var(--font-mono);font-size:11px;background:var(--bg);
      border:1px solid var(--border);border-radius:6px;padding:10px 12px;line-height:1.8;">
      <span style="color:#79c0ff;">H</span><span style="color:var(--text-muted);">|\\^&amp;|||Zoetis^Vetscan|||||||P|E1394</span><br>
      <span style="color:#79c0ff;">P</span><span style="color:var(--text-muted);">|1|${d.patient_id||'—'}</span><br>
      <span style="color:#79c0ff;">O</span><span style="color:var(--text-muted);">|1|${d.run_id||'—'}|^${d.rotor_type||'—'}</span><br>
      ${analytes.slice(0,6).map((a,i)=>
        `<span style="color:#7ee787;">R</span><span style="color:var(--text-muted);">|${i+1}|^^^${a.name}|${a.value}|${a.unit}|${a.reference_range?a.reference_range.join('-'):''}|<span style="color:${a.flag==='H'?'#ff7b72':a.flag==='L'?'#58a6ff':'#3fb950'}">${a.flag}</span></span><br>`
      ).join('')}
      ${analytes.length>6?`<span style="color:var(--text-dim);">... ${analytes.length-6} more records</span><br>`:''}
      <span style="color:#79c0ff;">L</span><span style="color:var(--text-muted);">|1|N</span>
    </div>
  `);
}
