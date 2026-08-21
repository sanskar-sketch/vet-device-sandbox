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
  // USE_REAL_DEVICE does NOT mean physical hardware is attached — it only
  // picks which simulator generates the data: the in-browser one (false)
  // or the network-hosted bridge service (true, used automatically once
  // deployed). Every server/lib/*.js bridge self-identifies as
  // "[SIM-BACKEND]" in its own connect payload — none of them talk to a
  // real device SDK yet (see the roadmap's Phase 3, not started). The
  // banner must never claim "REAL HARDWARE" until that actually changes.
  const remoteBridge = DeviceConfig.USE_REAL_DEVICE;
  const cfg = DeviceConfig[deviceKey] || {};

  const banner = document.createElement('div');
  banner.id = 'mode-banner';
  banner.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:999',
    'background:#1a1a2a', 'border-top:2px solid #58a6ff',
    'padding:6px 20px', 'display:flex', 'align-items:center', 'gap:16px',
    'font-size:12px', 'font-family:monospace'
  ].join(';');

  const dot   = '🔵';
  const label = `<strong style="color:#58a6ff">SIMULATED DATA</strong> <span style="color:#8b949e">(${remoteBridge ? 'network bridge' : 'in-browser'})</span>`;

  const target = remoteBridge
    ? `Bridge endpoint: <code style="color:#aef">${cfg.wsEndpoint || cfg.ip || cfg.host || '—'}</code> — no physical device connected; this returns simulated data`
    : `Generated entirely client-side, no network calls`;

  banner.innerHTML = `${dot} ${label} &nbsp;|&nbsp; ${target}`;

  // Shrink main panel to not overlap the banner
  document.body.style.paddingBottom = '34px';
  document.body.appendChild(banner);
}
