/**
 * js/sensor-viz.js
 *
 * Real-time canvas renderers for what each sensor's raw output would
 * actually look like — ported from the standalone device pages
 * (devices/flir-thermal.html, clarius-ultrasound.html, orbbec-femto-mega.html,
 * bionet-vemo-ecg.html, tekscan-gait.html), parameterized so they can be
 * driven from the unified exam flow instead of page-local globals.
 *
 * None of these read a real pixel/waveform buffer — sim mode returns null
 * for those (same as the original pages) — so the image is synthesized
 * procedurally, exactly like a live camera feed would look while the AI
 * model is still processing it.
 */

/* ── Thermal (FLIR) — iron/hot colormap heatmap ─────────────────────────────── */

function thermalColor(v) {
  const stops = [[0,0,0],[0,0,128],[128,0,200],[255,0,0],[255,165,0],[255,255,0],[255,255,255]];
  const idx = v * (stops.length - 1);
  const lo = Math.floor(idx), hi = Math.min(lo + 1, stops.length - 1);
  const t = idx - lo;
  return stops[lo].map((c, i) => Math.round(c + (stops[hi][i] - c) * t));
}

function drawThermalFrame(canvas, t) {
  const w = canvas.offsetWidth || 320, h = canvas.offsetHeight || 140;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const nx = (i % w) / w, ny = Math.floor(i / w) / h;
    const v = 0.4 + 0.5 * Math.sin(nx * 4 + t / 1000) * Math.cos(ny * 3) + Math.random() * 0.1;
    const clamp = Math.max(0, Math.min(1, v));
    const [r, g, b] = thermalColor(clamp);
    img.data[i*4] = r; img.data[i*4+1] = g; img.data[i*4+2] = b; img.data[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/* ── Ultrasound (Clarius) — B-mode fan-scan speckle ─────────────────────────── */

function drawUltrasoundFrame(canvas, depthCm) {
  const w = canvas.offsetWidth || 320, h = canvas.offsetHeight || 200;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);

  const cx = w / 2, cy = -h * 0.3;
  const r1 = h * 0.35, r2 = h * 1.2;
  const startAngle = Math.PI * 0.55, endAngle = Math.PI * 0.45;
  for (let r = r1; r < r2; r += 2) {
    for (let a = startAngle; a < Math.PI - startAngle + endAngle; a += 0.012) {
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (x < 0 || x > w || y < 0 || y > h) continue;
      const speckle = Math.random();
      const echo = speckle > 0.97 ? 200 + Math.random() * 55 :
                   speckle > 0.90 ? 80 + Math.random() * 80 :
                   speckle > 0.60 ? 20 + Math.random() * 40 :
                                     Math.random() * 15;
      const bright = Math.round(echo);
      ctx.fillStyle = `rgb(${bright},${bright},${bright})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  ctx.strokeStyle = 'rgba(0,200,100,0.4)'; ctx.lineWidth = 0.5;
  const depth = depthCm || 8;
  for (let d = 1; d <= depth; d++) {
    const ry = cy + r1 + (r2 - r1) * (d / depth);
    ctx.beginPath(); ctx.arc(cx, cy, ry, startAngle, Math.PI - startAngle + endAngle); ctx.stroke();
  }
}

/* ── Structural (Orbbec) — depth colormap + point-cloud scatter ─────────────── */

function hue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}
function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

function drawDepthFrame(canvas) {
  const w = canvas.offsetWidth || 320, h = canvas.offsetHeight || 160;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.random();
    const hue = (d * 240) | 0;
    const [r, g, b] = hslToRgb(hue / 360, 0.9, 0.5);
    img.data[i*4] = r; img.data[i*4+1] = g; img.data[i*4+2] = b; img.data[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Generic warm/color camera preview — also reused for the Patient Station BCS camera. */
function drawColorFrame(canvas) {
  const w = canvas.offsetWidth || 320, h = canvas.offsetHeight || 110;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#1a2a1a'); grad.addColorStop(0.5, '#2a3a2a'); grad.addColorStop(1, '#1a2a2a');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 45; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 3 + 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${(Math.random()*80+100)|0},${(Math.random()*80+120)|0},${(Math.random()*40+40)|0},0.7)`;
    ctx.fill();
  }
}

function drawPointCloud(canvas) {
  const w = canvas.offsetWidth || 320, h = canvas.offsetHeight || 90;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    const x = (Math.random() * 0.8 + 0.1) * w;
    const y = (Math.random() * 0.7 + 0.15) * h;
    const alpha = Math.random() * 0.7 + 0.3;
    ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(88,166,255,${alpha})`;
    ctx.fill();
  }
}

/* ── Cardiac (VEMO) — scrolling ECG trace ────────────────────────────────────── */

function ecgWaveform(t, hr, phase) {
  const period = 60 / hr;
  const tp = ((t + phase) % period + period) % period;
  const tn = tp / period;
  if (tn < 0.10) return 0.15 * Math.sin(tn / 0.10 * Math.PI);
  if (tn < 0.12) return -0.05;
  if (tn < 0.14) return -0.10;
  if (tn < 0.15) return 1.00;
  if (tn < 0.17) return -0.25;
  if (tn < 0.20) return 0;
  if (tn < 0.35) return 0.25 * Math.sin((tn - 0.20) / 0.15 * Math.PI);
  return 0;
}

function drawECGTrace(canvas, frameCount, hr) {
  const w = canvas.offsetWidth || 320, h = canvas.offsetHeight || 100;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#001a00'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,80,0,0.4)'; ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  ctx.strokeStyle = '#00ff44'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  const speed = 200;
  const tWindow = w / speed;
  const tStart = (frameCount * 0.04) - tWindow;
  for (let px = 0; px < w; px++) {
    const t = tStart + (px / w) * tWindow;
    const v = ecgWaveform(t, hr, 0);
    const py = h/2 - v * (h * 0.35);
    if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,255,68,0.8)'; ctx.font = '10px monospace';
  ctx.fillText(`${hr} bpm`, w - 52, 13);
}

/* ── Gait (Tekscan) — 4-paw pressure map, driven by real streamed frames ─────── */

function pressureAt(row, col, rows, cols, phase) {
  const cx = cols/2 + Math.sin(phase)*cols*0.15;
  const cy = rows/2 + Math.cos(phase*0.7)*rows*0.1;
  const paws = [
    {x: cx-cols*0.15, y: cy-rows*0.2, r: cols*0.07, amp: 0.6+0.3*Math.sin(phase)},
    {x: cx+cols*0.15, y: cy-rows*0.1, r: cols*0.07, amp: 0.5+0.4*Math.cos(phase)},
    {x: cx-cols*0.12, y: cy+rows*0.18, r: cols*0.07, amp: 0.7+0.2*Math.sin(phase+1)},
    {x: cx+cols*0.12, y: cy+rows*0.2,  r: cols*0.07, amp: 0.4+0.5*Math.cos(phase+2)},
  ];
  let v = 0;
  for (const p of paws) {
    const d = Math.sqrt((col-p.x)**2 + (row-p.y)**2);
    if (d < p.r) v += p.amp * (1 - d/p.r) ** 2;
  }
  return Math.min(1, v);
}

function pressureColor(v) {
  if (v < 0.01) return [10,10,10];
  if (v < 0.2)  return [0,0,Math.round(v/0.2*200)];
  if (v < 0.4)  return [0,Math.round((v-0.2)/0.2*200),200];
  if (v < 0.6)  return [0,200,Math.round(200-(v-0.4)/0.2*200)];
  if (v < 0.8)  return [Math.round((v-0.6)/0.2*255),200,0];
  return [255,Math.round(200-(v-0.8)/0.2*200),0];
}

/** Draws using the SAME phase the driver's own simulated frame carries (frame._simPhase). */
function drawPressureMap(canvas, rows, cols, phase) {
  const W = canvas.offsetWidth || 320, H = canvas.offsetHeight || 160;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = pressureAt(r, c, rows, cols, phase);
      const [red, green, blue] = pressureColor(v);
      ctx.fillStyle = `rgb(${red},${green},${blue})`;
      ctx.fillRect(c * cw, r * ch, cw - 0.5, ch - 0.5);
    }
  }
}

