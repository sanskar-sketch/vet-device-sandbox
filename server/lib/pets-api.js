/**
 * server/lib/pets-api.js
 *
 * Client & Pet Registry, cut down to what the sandbox needs: staff create
 * a pet record (linked to an owner by email, whether or not that owner has
 * registered yet), owners see only their own pets, vet/admin can search
 * across all of them.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { nowISO } = require('./utils');
const { requireAuth, requireRole } = require('./auth');
const { ah } = require('./async-handler');
const { getBreedDirectoryEntry } = require('../../js/breed-directory.js');

function router(db) {
  const r = express.Router();

  // Staff creates a pet at intake; owner can also add their own pet directly.
  // Owner email is mandatory when staff/admin creates a pet — the signed
  // report has nowhere to land otherwise. If no owner account exists yet
  // for that email, one is created here rather than waiting for the owner
  // to self-register, so the pet/report show up in their portal as soon as
  // a vet signs off. They set their own password later via "Forgot
  // password" on the sign-in page.
  r.post('/pets', requireAuth, requireRole('staff', 'admin', 'super_admin', 'owner'), ah(async (req, res) => {
    const { name, species, breed, breedKey, sex, age_years, weight_kg, microchip, color, allergies, medical_notes, owner_email } = req.body || {};
    if (!name || !species) return res.status(400).json({ error: 'name and species are required' });

    const isOwner = req.user.role === 'owner';
    if (!isOwner && !owner_email) return res.status(400).json({ error: 'owner_email is required' });

    const ownerEmail = isOwner ? req.user.email : owner_email;
    let ownerUserId = null;
    if (isOwner) {
      ownerUserId = req.user.id;
    } else {
      const existing = await db.prepare('SELECT id, role FROM users WHERE email = ?').get(ownerEmail);
      if (existing && existing.role === 'owner') {
        ownerUserId = existing.id;
      } else if (!existing) {
        const placeholderName = ownerEmail.split('@')[0];
        const password_hash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
        const created = await db.prepare(
          'INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(ownerEmail, password_hash, 'owner', placeholderName, nowISO());
        ownerUserId = created.lastInsertRowid;
      }
      // else: email already belongs to a non-owner account (staff/vet/admin)
      // — leave unlinked rather than risk misattributing someone's clinic
      // login as a pet owner account.
    }

    // Group ("Gundog", "Pastoral", ...) and size class ("Large", "Toy", ...)
    // come from js/breed-directory.js (canine-only — see that file's
    // header). Stored on the pet at creation time so every page that
    // displays a pet can show them without re-resolving the breed key.
    const directoryEntry = species !== 'Feline' ? getBreedDirectoryEntry(breedKey) : null;
    const breedGroup = directoryEntry ? directoryEntry.group : null;
    const breedSize = directoryEntry ? directoryEntry.size : null;

    const info = await db.prepare(`
      INSERT INTO pets (owner_user_id, owner_email, name, species, breed, breed_key, breed_group, breed_size, sex, age_years, weight_kg, microchip, color, allergies, medical_notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerUserId, ownerEmail, name, species, breed || null, breedKey || null, breedGroup, breedSize, sex || null,
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
