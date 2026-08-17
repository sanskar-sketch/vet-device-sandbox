/**
 * server/lib/pets-api.js
 *
 * Client & Pet Registry, cut down to what the sandbox needs: staff create
 * a pet record (linked to an owner by email, whether or not that owner has
 * registered yet), owners see only their own pets, vet/admin can search
 * across all of them.
 */
const express = require('express');
const { nowISO } = require('./utils');
const { requireAuth, requireRole } = require('./auth');
const { ah } = require('./async-handler');

function router(db) {
  const r = express.Router();

  // Staff creates a pet at intake; owner can also add their own pet directly.
  r.post('/pets', requireAuth, requireRole('staff', 'admin', 'super_admin', 'owner'), ah(async (req, res) => {
    const { name, species, breed, breedKey, sex, age_years, weight_kg, microchip, color, allergies, medical_notes, owner_email } = req.body || {};
    if (!name || !species) return res.status(400).json({ error: 'name and species are required' });

    const isOwner = req.user.role === 'owner';
    const ownerEmail = isOwner ? req.user.email : (owner_email || null);
    const ownerUserId = isOwner
      ? req.user.id
      : (ownerEmail ? ((await db.prepare('SELECT id FROM users WHERE email = ? AND role = ?').get(ownerEmail, 'owner')) || {}).id || null : null);

    const info = await db.prepare(`
      INSERT INTO pets (owner_user_id, owner_email, name, species, breed, breed_key, sex, age_years, weight_kg, microchip, color, allergies, medical_notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerUserId, ownerEmail, name, species, breed || null, breedKey || null, sex || null,
      age_years ?? null, weight_kg ?? null, microchip || null, color || null, allergies || null, medical_notes || null, nowISO());

    res.json(await db.prepare('SELECT * FROM pets WHERE id = ?').get(info.lastInsertRowid));
  }));

  // Staff/vet/admin: search across all pets (for intake lookup / vet context).
  // `owner_email` does an exact (case-insensitive) match — used by the Patient
  // Station owner lookup, where a substring match would wrongly surface pets
  // belonging to unrelated owners with similar-looking addresses. `search` is
  // the looser free-text fallback used elsewhere (e.g. Patient Records).
  r.get('/pets', requireAuth, requireRole('staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const ownerEmail = (req.query.owner_email || '').trim();
    const q = (req.query.search || '').trim();
    let rows;
    if (ownerEmail) {
      rows = await db.prepare(`
        SELECT * FROM pets WHERE LOWER(owner_email) = LOWER(?) ORDER BY created_at DESC
      `).all(ownerEmail);
    } else if (q) {
      rows = await db.prepare(`
        SELECT * FROM pets
        WHERE name ILIKE ? OR owner_email ILIKE ? OR microchip ILIKE ?
        ORDER BY created_at DESC LIMIT 50
      `).all(`%${q}%`, `%${q}%`, `%${q}%`);
    } else {
      rows = await db.prepare('SELECT * FROM pets ORDER BY created_at DESC LIMIT 50').all();
    }
    res.json(rows);
  }));

  // Owner: only their own pets. Clinic roles may also hit this when previewing
  // the Owner Portal — they simply see whatever (if anything) is attributed
  // to their own account, same as any owner would.
  r.get('/pets/mine', requireAuth, requireRole('owner', 'staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM pets WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(rows);
  }));

  // Staff/vet/admin/super_admin: single pet with joined owner contact detail —
  // registered owners resolve to their user profile, unregistered ones fall
  // back to the intake email captured on the pet record.
  r.get('/pets/:id', requireAuth, requireRole('staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const pet = await db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);
    if (!pet) return res.status(404).json({ error: 'pet not found' });

    let owner = null;
    if (pet.owner_user_id) {
      const u = await db.prepare('SELECT id, name, email, phone, address FROM users WHERE id = ?').get(pet.owner_user_id);
      if (u) owner = { ...u, registered: true };
    }
    if (!owner && pet.owner_email) owner = { email: pet.owner_email, registered: false };

    res.json({ ...pet, owner });
  }));

  return r;
}

module.exports = { router };
