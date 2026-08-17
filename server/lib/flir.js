/**
 * REST simulation of a FLIR A-series camera's built-in API — mirrors
 * FlirSimDriver, matching exactly what FlirRealDriver already calls
 * (http://{ip}/api/...). A real camera has no bridge (it's REST-native),
 * so this stands in for the camera itself, not a bridge process.
 */
const express = require('express');
const { rand, nowISO } = require('./utils');

function router() {
  const r = express.Router();

  r.get('/tempsensor/:n.json', (req, res) => {
    res.json({ instance: parseInt(req.params.n, 10), name: 'Internal Housing Sensor', temperature: rand(28, 35, 2), unit: req.query.tempUnit || 'C', timestamp: nowISO() });
  });

  r.get('/image/current', (req, res) => {
    // 1x1 transparent PNG placeholder — real mode returns the actual JPEG/RJPEG blob.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    res.set('Content-Type', 'image/png');
    res.send(png);
  });

  r.get('/spot/:n.json', (req, res) => {
    res.json({ name: `Spot${req.params.n}`, temperature: rand(36, 42, 2), unit: req.query.tempUnit || 'C', x: rand(100, 500, 0), y: rand(80, 400, 0), timestamp: nowISO() });
  });

  r.get('/box/:n.json', (req, res) => {
    const mx = rand(39, 43, 2), mn = rand(33, 36, 2);
    res.json({
      name: `Box${req.params.n}`, max: mx, min: mn, avg: rand(mn, mx, 2), unit: req.query.tempUnit || 'C',
      area: { x: rand(50, 200, 0), y: rand(50, 200, 0), width: rand(100, 300, 0), height: rand(100, 200, 0) }, timestamp: nowISO()
    });
  });

  r.get('/line/:n.json', (req, res) => {
    const pts = Array.from({ length: 20 }, () => rand(35, 42, 2));
    res.json({
      name: `Line${req.params.n}`, max: Math.max(...pts), min: Math.min(...pts),
      avg: parseFloat((pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(2)), unit: req.query.tempUnit || 'C', points: pts, timestamp: nowISO()
    });
  });

  r.get('/environment.json', (req, res) => {
    res.json({
      ambient_temp_c: rand(18, 26, 1), relative_humidity_pct: rand(35, 65, 0),
      reflected_temp_c: rand(18, 26, 1), emissivity: rand(0.95, 0.98, 2),
      distance_m: rand(0.6, 1.2, 2), timestamp: nowISO()
    });
  });

  r.get('/alarms', (req, res) => {
    const triggered = Math.random() > 0.7;
    res.json({
      alarms: [
        { instance: 1, name: 'High Temp Alert', state: triggered ? 'active' : 'inactive', triggered, threshold: 41.0, unit: 'C', associatedROI: 'Box1' },
        { instance: 2, name: 'Low Temp Warning', state: 'inactive', triggered: false, threshold: 30.0, unit: 'C', associatedROI: 'Spot1' }
      ]
    });
  });

  return r;
}

module.exports = { router };
