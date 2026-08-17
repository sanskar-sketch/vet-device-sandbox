/**
 * js/hardware-scan.js
 *
 * Simulated network/port discovery. Walks HARDWARE_REGISTRY, "probes" each
 * module's configured endpoint, and reuses each device's real connect()
 * handshake (so firmware/serial shown here are the same the driver would
 * actually report) — this is exactly what a real scan would do, just
 * against sim drivers instead of live sockets.
 */

async function runHardwareScan(logger, onResult, onStart) {
  const results = [];

  for (const hw of HARDWARE_REGISTRY) {
    if (onStart) onStart(hw);
    logger.info(`Probing <strong>${hw.label}</strong> — ${escapeHtml(hw.endpoint)} (${escapeHtml(hw.protocol)})`);
    await delay(rand(250, 500, 0));

    // Occasionally simulate a retried handshake for realism.
    if (Math.random() < 0.15) {
      logger.warn(`${hw.label}: no response, retrying handshake…`);
      await delay(rand(300, 600, 0));
    }

    let driver, connectResult;
    try {
      driver = DriverFactory.get(hw.key);
      connectResult = await driver.connect();
    } catch (err) {
      logger.error(`${hw.label}: connection failed — ${err.message}`);
      const failed = { ...hw, ok: false, error: err.message };
      results.push(failed);
      if (onResult) onResult(failed);
      continue;
    }

    const info = connectResult.info;
    const infoLine = Object.entries(info).map(([k, v]) => `${k}=${v}`).join(', ');
    logger.success(`${hw.label} <strong>ONLINE</strong> — ${escapeHtml(infoLine)}`);

    const result = { ...hw, ok: true, info, connectedAt: nowISO() };
    results.push(result);
    if (onResult) onResult(result);

    if (driver.disconnect) await driver.disconnect();
  }

  return results;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
