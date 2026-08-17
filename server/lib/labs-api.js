/**
 * server/lib/labs-api.js
 *
 * Laboratory management: super_admin can create/manage every lab; admin
 * manages only the one lab they belong to (req.user.lab_id). Each lab
 * carries its own staff, assigned doctors (vets), and a machine roster
 * with an operational state.
 */
const express = require('express');
const { nowISO } = require('./utils');
const { requireAuth, requireRole } = require('./auth');
const { ah } = require('./async-handler');

const MACHINE_STATES = ['operational', 'maintenance', 'offline'];

function canManageLab(user, labId) {
  return user.role === 'super_admin' || (user.role === 'admin' && user.lab_id === labId);
}

async function serializeLab(db, lab) {
  const staff = await db.prepare(
    "SELECT id, name, email, role, phone, created_at FROM users WHERE lab_id = ? AND role IN ('staff','admin') ORDER BY role, name"
  ).all(lab.id);
  const doctors = await db.prepare(
    "SELECT id, name, email, specialty, phone, created_at FROM users WHERE lab_id = ? AND role = 'vet' ORDER BY name"
  ).all(lab.id);
  const machines = await db.prepare('SELECT * FROM lab_machines WHERE lab_id = ? ORDER BY name').all(lab.id);
  return { ...lab, staff, doctors, machines };
}

function router(db) {
  const r = express.Router();

  // ── Create a lab (super_admin only) ──────────────────────────────────────
  r.post('/labs', requireAuth, requireRole('super_admin'), ah(async (req, res) => {
    const { name, address } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const info = await db.prepare('INSERT INTO labs (name, address, created_at) VALUES (?, ?, ?)')
      .run(name, address || null, nowISO());
    const lab = await db.prepare('SELECT * FROM labs WHERE id = ?').get(info.lastInsertRowid);
    res.json(await serializeLab(db, lab));
  }));

  // ── List labs — super_admin sees all, admin sees only their own ─────────
  r.get('/labs', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    let rows;
    if (req.user.role === 'super_admin') {
      rows = await db.prepare('SELECT * FROM labs ORDER BY created_at DESC').all();
    } else {
      rows = req.user.lab_id
        ? await db.prepare('SELECT * FROM labs WHERE id = ?').all(req.user.lab_id)
        : [];
    }
    res.json(await Promise.all(rows.map(l => serializeLab(db, l))));
  }));

  // ── Single lab detail ─────────────────────────────────────────────────────
  r.get('/labs/:id', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const lab = await db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'lab not found' });
    if (!canManageLab(req.user, lab.id)) return res.status(403).json({ error: 'not permitted for this lab' });
    res.json(await serializeLab(db, lab));
  }));

  // ── Update lab info (name/address) ────────────────────────────────────────
  r.patch('/labs/:id', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const lab = await db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'lab not found' });
    if (!canManageLab(req.user, lab.id)) return res.status(403).json({ error: 'not permitted for this lab' });

    const { name, address } = req.body || {};
    await db.prepare('UPDATE labs SET name = ?, address = ? WHERE id = ?')
      .run(name || lab.name, address !== undefined ? (address || null) : lab.address, lab.id);
    res.json(await serializeLab(db, await db.prepare('SELECT * FROM labs WHERE id = ?').get(lab.id)));
  }));

  // ── Add a machine to a lab ────────────────────────────────────────────────
  r.post('/labs/:id/machines', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const lab = await db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'lab not found' });
    if (!canManageLab(req.user, lab.id)) return res.status(403).json({ error: 'not permitted for this lab' });

    const { name, machine_type, state } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const st = MACHINE_STATES.includes(state) ? state : 'operational';

    const info = await db.prepare(
      'INSERT INTO lab_machines (lab_id, name, machine_type, state, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(lab.id, name, machine_type || null, st, nowISO());
    res.json(await db.prepare('SELECT * FROM lab_machines WHERE id = ?').get(info.lastInsertRowid));
  }));

  // ── Update a machine (name/type/state) ────────────────────────────────────
  r.patch('/labs/machines/:machineId', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const machine = await db.prepare('SELECT * FROM lab_machines WHERE id = ?').get(req.params.machineId);
    if (!machine) return res.status(404).json({ error: 'machine not found' });
    if (!canManageLab(req.user, machine.lab_id)) return res.status(403).json({ error: 'not permitted for this lab' });

    const { name, machine_type, state } = req.body || {};
    if (state !== undefined && !MACHINE_STATES.includes(state))
      return res.status(400).json({ error: `state must be one of: ${MACHINE_STATES.join(', ')}` });

    await db.prepare('UPDATE lab_machines SET name = ?, machine_type = ?, state = ? WHERE id = ?').run(
      name || machine.name,
      machine_type !== undefined ? (machine_type || null) : machine.machine_type,
      state || machine.state,
      machine.id
    );
    res.json(await db.prepare('SELECT * FROM lab_machines WHERE id = ?').get(machine.id));
  }));

  // ── Remove a machine ───────────────────────────────────────────────────────
  r.delete('/labs/machines/:machineId', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const machine = await db.prepare('SELECT * FROM lab_machines WHERE id = ?').get(req.params.machineId);
    if (!machine) return res.status(404).json({ error: 'machine not found' });
    if (!canManageLab(req.user, machine.lab_id)) return res.status(403).json({ error: 'not permitted for this lab' });

    await db.prepare('DELETE FROM lab_machines WHERE id = ?').run(machine.id);
    res.json({ ok: true });
  }));

  return r;
}

module.exports = { router };
