/**
 * server/lib/exams-api.js
 *
 * Exam lifecycle + admin/super-admin full-data endpoints.
 *
 * Role access summary:
 *   staff           → submit exams, read own submitted exams
 *   vet             → read/override/sign awaiting_review; read all signed; compare by pet
 *   owner           → read own pets' signed exams; compare by pet (signed only)
 *   admin           → all of the above (read-only); /admin/stats; /admin/users-full; /admin/exams-full
 *   super_admin     → same as admin (plus role management via auth.js)
 */
const express = require('express');
const { nowISO } = require('./utils');
const { requireAuth, requireRole, publicUser } = require('./auth');
const { ah } = require('./async-handler');

const RISK_LEVELS = ['Low Risk', 'Moderate Risk', 'High Risk'];

function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

async function logEvent(db, examId, actorUserId, action, detail) {
  await db.prepare(
    'INSERT INTO exam_events (exam_id, actor_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(examId, actorUserId, action, detail || null, nowISO());
}

async function serializeExam(row, { db = null } = {}) {
  const out = {
    id:                   row.id,
    pet_id:               row.pet_id,
    created_by_user_id:   row.created_by_user_id,
    assigned_vet_user_id: row.assigned_vet_user_id,
    assigned_vet_name:    null,
    status:               row.status,
    report:               JSON.parse(row.report_json),
    ai_narrative:         row.ai_narrative,
    vet_notes:            row.vet_notes,
    signed_by_user_id:    row.signed_by_user_id,
    signed_by_name:       null,
    signed_at:            row.signed_at,
    created_at:           row.created_at,
  };
  if (row.assigned_vet_user_id && db) {
    const vet = await db.prepare('SELECT name FROM users WHERE id = ?').get(row.assigned_vet_user_id);
    out.assigned_vet_name = vet ? vet.name : null;
  }
  if (row.signed_by_user_id && db) {
    const vet = await db.prepare('SELECT name FROM users WHERE id = ?').get(row.signed_by_user_id);
    out.signed_by_name = vet ? vet.name : null;
  }
  if (db) out.pet = await db.prepare('SELECT * FROM pets WHERE id = ?').get(row.pet_id);
  return out;
}

async function serializeExams(rows, opts) {
  return Promise.all(rows.map(row => serializeExam(row, opts)));
}

function router(db) {
  const r = express.Router();

  // ── Staff submits exam for review ────────────────────────────────────────
  r.post('/exams', requireAuth, requireRole('staff', 'admin', 'super_admin'), ah(async (req, res) => {
    const { pet_id, report, ai_narrative, assigned_vet_user_id } = req.body || {};
    if (!pet_id || !report || !report.systems)
      return res.status(400).json({ error: 'pet_id and a report (with systems) are required' });

    const pet = await db.prepare('SELECT id FROM pets WHERE id = ?').get(pet_id);
    if (!pet) return res.status(404).json({ error: 'pet not found' });

    // Validate assigned_vet_user_id if provided
    if (assigned_vet_user_id) {
      const vet = await db.prepare("SELECT id FROM users WHERE id = ? AND role = 'vet'").get(assigned_vet_user_id);
      if (!vet) return res.status(400).json({ error: 'assigned_vet_user_id must be a valid vet account' });
    }

    const info = await db.prepare(`
      INSERT INTO exams (pet_id, created_by_user_id, assigned_vet_user_id, status, report_json, ai_narrative, created_at)
      VALUES (?, ?, ?, 'awaiting_review', ?, ?, ?)
    `).run(pet_id, req.user.id, assigned_vet_user_id || null, JSON.stringify(report), ai_narrative || null, nowISO());

    await logEvent(db, info.lastInsertRowid, req.user.id, 'created',
      assigned_vet_user_id
        ? `Exam submitted for review by vet ID ${assigned_vet_user_id}`
        : 'Exam submitted for vet review');

    const row = await db.prepare('SELECT * FROM exams WHERE id = ?').get(info.lastInsertRowid);
    res.json(await serializeExam(row, { db }));
  }));

  // ── Pending queue / staff's own exams ────────────────────────────────────
  r.get('/exams', requireAuth, requireRole('vet', 'staff', 'admin', 'super_admin'), ah(async (req, res) => {
    const { status, created_by } = req.query;
    let rows;

    if (created_by === 'me') {
      rows = await db.prepare('SELECT * FROM exams WHERE created_by_user_id = ? ORDER BY created_at DESC')
        .all(req.user.id);
    } else if (status) {
      // Vets see only exams assigned to them (or unassigned); admin/super_admin see all
      if (req.user.role === 'vet') {
        rows = await db.prepare(
          'SELECT * FROM exams WHERE status = ? AND (assigned_vet_user_id = ? OR assigned_vet_user_id IS NULL) ORDER BY created_at ASC'
        ).all(status, req.user.id);
      } else {
        rows = await db.prepare('SELECT * FROM exams WHERE status = ? ORDER BY created_at ASC').all(status);
      }
    } else {
      rows = await db.prepare('SELECT * FROM exams ORDER BY created_at DESC LIMIT 100').all();
    }
    res.json(await serializeExams(rows, { db }));
  }));

  // ── Owner: own pets' signed exams ────────────────────────────────────────
  // Clinic roles may also hit this when previewing the Owner Portal.
  r.get('/exams/mine', requireAuth, requireRole('owner', 'staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const rows = await db.prepare(`
      SELECT e.* FROM exams e
      JOIN pets p ON p.id = e.pet_id
      WHERE p.owner_user_id = ? AND e.status = 'signed'
      ORDER BY e.signed_at DESC
    `).all(req.user.id);
    res.json(await serializeExams(rows, { db }));
  }));

  // ── All exams for a specific pet (for comparison) ────────────────────────
  // vet/admin/super_admin: all statuses
  // owner: only signed, and only their own pet
  r.get('/exams/by-pet/:petId', requireAuth, ah(async (req, res) => {
    const petId = Number(req.params.petId);
    const role = req.user.role;

    if (role === 'owner') {
      const pet = await db.prepare('SELECT * FROM pets WHERE id = ?').get(petId);
      if (!pet || pet.owner_user_id !== req.user.id)
        return res.status(403).json({ error: 'not permitted' });
      const rows = await db.prepare(
        "SELECT * FROM exams WHERE pet_id = ? AND status = 'signed' ORDER BY signed_at DESC"
      ).all(petId);
      return res.json(await serializeExams(rows, { db }));
    }

    if (role === 'vet' || role === 'staff' || isAdminRole(role)) {
      const rows = await db.prepare(
        'SELECT * FROM exams WHERE pet_id = ? ORDER BY created_at DESC'
      ).all(petId);
      return res.json(await serializeExams(rows, { db }));
    }

    return res.status(403).json({ error: 'not permitted' });
  }));

  // ── Single exam ──────────────────────────────────────────────────────────
  r.get('/exams/:id', requireAuth, ah(async (req, res) => {
    const row = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'exam not found' });

    const role = req.user.role;
    if (role === 'vet' || isAdminRole(role)) {
      // full access
    } else if (role === 'staff') {
      if (row.created_by_user_id !== req.user.id)
        return res.status(403).json({ error: 'not permitted' });
    } else if (role === 'owner') {
      const pet = await db.prepare('SELECT owner_user_id FROM pets WHERE id = ?').get(row.pet_id);
      if (!pet || pet.owner_user_id !== req.user.id || row.status !== 'signed')
        return res.status(403).json({ error: 'not permitted' });
    }

    const events = await db.prepare('SELECT * FROM exam_events WHERE exam_id = ? ORDER BY created_at ASC').all(row.id);
    res.json({ ...(await serializeExam(row, { db })), events });
  }));

  // ── Vet overrides a risk level ───────────────────────────────────────────
  r.patch('/exams/:id/override', requireAuth, requireRole('vet'), ah(async (req, res) => {
    const { system_key, level, reason } = req.body || {};
    if (!system_key || !level || !reason)
      return res.status(400).json({ error: 'system_key, level, and reason are required' });
    if (!RISK_LEVELS.includes(level))
      return res.status(400).json({ error: `level must be one of ${RISK_LEVELS.join(', ')}` });

    const row = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'exam not found' });
    if (row.status !== 'awaiting_review')
      return res.status(409).json({ error: 'exam is already signed and frozen' });

    const report = JSON.parse(row.report_json);
    const system = report.systems[system_key];
    if (!system) return res.status(400).json({ error: `unknown system: ${system_key}` });

    const previousLevel = system.level;
    system.level = level;
    system.vet_override = { by_user_id: req.user.id, reason, previous_level: previousLevel, at: nowISO() };

    await db.prepare('UPDATE exams SET report_json = ? WHERE id = ?').run(JSON.stringify(report), row.id);
    await logEvent(db, row.id, req.user.id, 'risk_overridden',
      `${system_key}: ${previousLevel} → ${level} — ${reason}`);

    const updated = await db.prepare('SELECT * FROM exams WHERE id = ?').get(row.id);
    res.json(await serializeExam(updated, { db }));
  }));

  // ── Vet signs & releases ─────────────────────────────────────────────────
  r.post('/exams/:id/sign', requireAuth, requireRole('vet'), ah(async (req, res) => {
    const { vet_notes } = req.body || {};
    const row = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'exam not found' });
    if (row.status === 'signed') return res.status(409).json({ error: 'already signed' });

    await db.prepare(`
      UPDATE exams SET status = 'signed', signed_by_user_id = ?, signed_at = ?, vet_notes = ?
      WHERE id = ?
    `).run(req.user.id, nowISO(), vet_notes || null, row.id);

    await logEvent(db, row.id, req.user.id, 'signed', 'Report signed and released to owner');

    const updated = await db.prepare('SELECT * FROM exams WHERE id = ?').get(row.id);
    res.json(await serializeExam(updated, { db }));
  }));

  // ── Admin stats ──────────────────────────────────────────────────────────
  r.get('/admin/stats', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const petCount      = Number((await db.prepare('SELECT COUNT(*) AS n FROM pets').get()).n);
    const examCount     = Number((await db.prepare('SELECT COUNT(*) AS n FROM exams').get()).n);
    const awaitingCount = Number((await db.prepare("SELECT COUNT(*) AS n FROM exams WHERE status = 'awaiting_review'").get()).n);
    const signedCount   = Number((await db.prepare("SELECT COUNT(*) AS n FROM exams WHERE status = 'signed'").get()).n);
    const userCounts    = await db.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role').all();

    const allExams = await db.prepare('SELECT report_json FROM exams').all();
    const scores   = allExams.map(e => JSON.parse(e.report_json).overall_health_score).filter(n => typeof n === 'number');
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const recent = await db.prepare(`
      SELECT e.id, e.status, e.created_at, e.signed_at, p.name AS pet_name, p.species
      FROM exams e JOIN pets p ON p.id = e.pet_id
      ORDER BY e.created_at DESC LIMIT 10
    `).all();

    res.json({
      pet_count:                    petCount,
      exam_count:                   examCount,
      awaiting_review_count:        awaitingCount,
      signed_count:                 signedCount,
      users_by_role:                Object.fromEntries(userCounts.map(u => [u.role, Number(u.n)])),
      average_overall_health_score: avgScore,
      recent_exams:                 recent,
    });
  }));

  // ── Admin: full user list (admin + super_admin) ──────────────────────────
  // admin sees non-owners; super_admin sees everyone
  r.get('/admin/users-full', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    let rows;
    if (req.user.role === 'super_admin') {
      rows = await db.prepare(
        'SELECT id, email, role, name, phone, specialty, clinic_name, address, created_at, updated_at FROM users ORDER BY created_at DESC'
      ).all();
    } else {
      rows = await db.prepare(
        "SELECT id, email, role, name, phone, specialty, clinic_name, address, created_at, updated_at FROM users WHERE role != 'owner' ORDER BY created_at DESC"
      ).all();
    }

    // Attach pet count for owners
    const result = await Promise.all(rows.map(async u => {
      const petCount = u.role === 'owner'
        ? Number((await db.prepare('SELECT COUNT(*) AS n FROM pets WHERE owner_user_id = ?').get(u.id)).n)
        : null;
      return { ...u, pet_count: petCount };
    }));
    res.json(result);
  }));

  // ── Admin: full exam list with pet + vet detail ───────────────────────────
  r.get('/admin/exams-full', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM exams ORDER BY created_at DESC LIMIT 200').all();
    res.json(await serializeExams(rows, { db }));
  }));

  return r;
}

module.exports = { router };
