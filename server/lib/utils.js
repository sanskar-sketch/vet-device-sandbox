function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max, decimals = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(decimals)); }
function nowISO() { return new Date().toISOString(); }

module.exports = { delay, rand, nowISO };
