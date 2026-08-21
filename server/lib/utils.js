function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max, decimals = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(decimals)); }
function nowISO() { return new Date().toISOString(); }
// Reconstructs this deploy's own public origin from the incoming request
// (works for localhost, the current Render URL, or any future custom
// domain with no code change) — used to build absolute links/asset URLs
// for outbound email, which can't use relative paths like the app itself.
function appOrigin(req) { return `${req.protocol}://${req.get('host')}`; }

module.exports = { delay, rand, nowISO, appOrigin };
