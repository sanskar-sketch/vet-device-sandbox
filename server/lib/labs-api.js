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

  // ── Clinic directory (any signed-in role) ─────────────────────────────────
  // Just enough to pick a clinic when requesting an appointment — id/name/
  // address only, never the staff/doctor/machine roster serializeLab() adds
  // for the admin-only /labs endpoint below.
  r.get('/labs/directory', requireAuth, ah(async (req, res) => {
    const rows = await db.prepare('SELECT id, name, address FROM labs ORDER BY name ASC').all();
    res.json(rows);
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

  // ── Bookable schedule: weekly opening hours + appointment length ─────────
  // This is what the owner-facing slot grid is generated from; see
  // server/lib/availability.js. Same admin scoping as the rest of this file —
  // an admin manages only their own lab, super_admin manages any.
  r.get('/labs/:id/schedule', requireAuth, requireRole('admin', 'super_admin', 'staff', 'vet'), ah(async (req, res) => {
    const lab = await db.prepare('SELECT id, name, slot_minutes FROM labs WHERE id = ?').get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'lab not found' });
    // Clinic staff need to read the schedule to block time against it, but
    // only for the lab they belong to.
    const isClinicStaff = req.user.role === 'staff' || req.user.role === 'vet';
    if (isClinicStaff ? lab.id !== req.user.lab_id : !canManageLab(req.user, lab.id))
      return res.status(403).json({ error: 'not permitted for this lab' });

    const hours = await db.prepare('SELECT weekday, is_open, opens_at, closes_at FROM lab_hours WHERE lab_id = ? ORDER BY weekday').all(lab.id);
    res.json({ lab_id: lab.id, lab_name: lab.name, slot_minutes: lab.slot_minutes || 30, hours });
  }));

  r.put('/labs/:id/schedule', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const lab = await db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'lab not found' });
    if (!canManageLab(req.user, lab.id)) return res.status(403).json({ error: 'not permitted for this lab' });

    const { slot_minutes, hours } = req.body || {};

    if (slot_minutes !== undefined) {
      const mins = Number(slot_minutes);
      // Bounded because the grid is generated from it: a zero or negative
      // step never terminates, and anything under 5 minutes produces a
      // hundreds-of-slots day that is useless to pick from.
      if (!Number.isInteger(mins) || mins < 5 || mins > 480)
        return res.status(400).json({ error: 'slot_minutes must be a whole number of minutes between 5 and 480' });
      await db.prepare('UPDATE labs SET slot_minutes = ? WHERE id = ?').run(mins, lab.id);
    }

    if (hours !== undefined) {
      if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours must be an array' });
      const TIME_RE = /^\d{2}:\d{2}$/;
      for (const h of hours) {
        const weekday = Number(h.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
          return res.status(400).json({ error: 'each hours entry needs a weekday 0-6' });
        const isOpen = h.is_open !== false;
        const opens = h.opens_at || '09:00';
        const closes = h.closes_at || '17:00';
        if (!TIME_RE.test(opens) || !TIME_RE.test(closes))
          return res.status(400).json({ error: 'opens_at and closes_at must be HH:MM' });
        if (isOpen && closes <= opens)
          return res.status(400).json({ error: `closing time must be after opening time (weekday ${weekday})` });

        // The db.js shim appends `RETURNING id` to any INSERT that lacks a
        // RETURNING clause, and lab_hours is keyed on (lab_id, weekday) with
        // no id column — so this states its own RETURNING to stop the
        // rewrite (otherwise: 'column "id" does not exist').
        await db.prepare(`
          INSERT INTO lab_hours (lab_id, weekday, is_open, opens_at, closes_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (lab_id, weekday)
          DO UPDATE SET is_open = EXCLUDED.is_open, opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at
          RETURNING lab_id
        `).run(lab.id, weekday, isOpen, opens, closes);
      }
    }

    const updated = await db.prepare('SELECT id, name, slot_minutes FROM labs WHERE id = ?').get(lab.id);
    const rows = await db.prepare('SELECT weekday, is_open, opens_at, closes_at FROM lab_hours WHERE lab_id = ? ORDER BY weekday').all(lab.id);
    res.json({ lab_id: updated.id, lab_name: updated.name, slot_minutes: updated.slot_minutes, hours: rows });
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
