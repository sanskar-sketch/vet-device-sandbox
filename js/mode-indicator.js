/**
 * js/mode-indicator.js
 *
 * Injects a banner at the top of every device page showing:
 *   - current mode (SIMULATED / REAL)
 *   - which config key is active
 *   - a one-line instruction to switch
 *
 * Call injectModeIndicator(deviceKey) at the bottom of each page's <script>.
 */
function injectModeIndicator(deviceKey) {
  const isReal = DeviceConfig.USE_REAL_DEVICE;
  const cfg     = DeviceConfig[deviceKey] || {};

  const banner = document.createElement('div');
  banner.id = 'mode-banner';
  banner.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:999',
    `background:${isReal ? '#0f2d1a' : '#1a1a2a'}`,
    `border-top:2px solid ${isReal ? '#3fb950' : '#58a6ff'}`,
    'padding:6px 20px', 'display:flex', 'align-items:center', 'gap:16px',
    'font-size:12px', 'font-family:monospace'
  ].join(';');

  const dot   = isReal ? '🟢' : '🔵';
  const label = isReal
    ? `<strong style="color:#3fb950">REAL HARDWARE</strong>`
    : `<strong style="color:#58a6ff">SIMULATED DATA</strong>`;

  const target = isReal
    ? `Connected to: <code style="color:#aef">${cfg.ip || cfg.host || cfg.wsEndpoint || '—'}</code>`
    : `To use real hardware: set <code style="color:#ffaa44">DeviceConfig.USE_REAL_DEVICE = true</code> in <code>js/driver-base.js</code>`;

  banner.innerHTML = `${dot} ${label} &nbsp;|&nbsp; ${target}`;

  // Shrink main panel to not overlap the banner
  document.body.style.paddingBottom = '34px';
  document.body.appendChild(banner);
}
