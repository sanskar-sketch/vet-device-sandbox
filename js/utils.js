/* ─── Vitarus · Shared Utilities ──────────────────────────────────────────── */

/* ── Console Logger ─────────────────────────────────────────────────────── */
class SandboxLogger {
  constructor(elementId) {
    this.el = document.getElementById(elementId);
  }
  _write(level, msg) {
    const t = new Date().toTimeString().slice(0, 8);
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="log-time">${t}</span><span class="log-${level}">${msg}</span>`;
    this.el.appendChild(line);
    this.el.scrollTop = this.el.scrollHeight;
  }
  info(msg)    { this._write('info', msg); }
  success(msg) { this._write('success', msg); }
  warn(msg)    { this._write('warn', msg); }
  error(msg)   { this._write('error', msg); }
  data(msg)    { this._write('data', msg); }
  clear()      { this.el.innerHTML = ''; }
}

/* ── Tab switcher ───────────────────────────────────────────────────────── */
function initTabs(containerSelector) {
  const root = containerSelector || '';
  const tabSel = root ? root + ' .pane-tab' : '.pane-tab';
  document.querySelectorAll(tabSel).forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.pane-tabs').parentElement;
      parent.querySelectorAll('.pane-tab').forEach(t => t.classList.remove('active'));
      parent.querySelectorAll('.pane-content > div').forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      const target = parent.querySelector('#' + tab.dataset.target);
      if (target) target.style.display = 'block';
    });
  });
  // activate first tab in each group
  const groupSel = root ? root + ' .pane-tabs' : '.pane-tabs';
  document.querySelectorAll(groupSel).forEach(group => {
    const first = group.querySelector('.pane-tab');
    if (first) first.click();
  });
}

/* ── Syntax-highlight a JSON object into HTML ───────────────────────────── */
function jsonHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
      let cls = 'color:#a5d6ff'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) cls = 'color:#79c0ff'; // key
        else cls = 'color:#a8ff78';                   // string
      } else if (/true|false/.test(match)) cls = 'color:#ffaa44';
      else if (/null/.test(match)) cls = 'color:#ff7b72';
      return `<span style="${cls}">${match}</span>`;
    });
}

/* ── Simulate a delay ───────────────────────────────────────────────────── */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Random in range ────────────────────────────────────────────────────── */
function rand(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

/* ── Format bytes ───────────────────────────────────────────────────────── */
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

/* ── Format timestamp ───────────────────────────────────────────────────── */
function nowISO() { return new Date().toISOString(); }

/* ── Status pill HTML ────────────────────────────────────────────────────── */
function statusPill(code) {
  const ok = code >= 200 && code < 300;
  return `<span class="status-pill ${ok ? 'status-200' : 'status-error'}">● ${code} ${ok ? 'OK' : 'ERROR'}</span>`;
}
