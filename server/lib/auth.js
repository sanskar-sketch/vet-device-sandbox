/**
 * server/lib/auth.js
 *
 * Login / register / session + profile management.
 * Roles: owner | vet | staff | admin | super_admin
 *
 * Owners self-register; vet/staff/admin are seeded or created by admin/super_admin.
 * super_admin can additionally manage admin accounts and update any user's role.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { nowISO, appOrigin } = require('./utils');
const { ah } = require('./async-handler');
const email = require('./email');

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

const CLINIC_ROLES = ['vet', 'staff', 'admin', 'super_admin'];

function publicUser(u) {
  return {
    id:          u.id,
    email:       u.email,
    role:        u.role,
    name:        u.name,
    phone:       u.phone       || null,
    specialty:   u.specialty   || null,
    clinic_name: u.clinic_name || null,
    address:     u.address     || null,
    lab_id:      u.lab_id      || null,
    created_at:  u.created_at,
    updated_at:  u.updated_at  || null,
  };
}

function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'super_admin');
}

function router(db) {
  const r = express.Router();

  // ── Register (owners only) ───────────────────────────────────────────────
  r.post('/register', ah(async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name)
      return res.status(400).json({ error: 'email, password, and name are required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'password must be at least 8 characters' });

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'an account with that email already exists' });

    const password_hash = bcrypt.hashSync(password, 10);
    const info = await db.prepare(
      'INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(email, password_hash, 'owner', name, nowISO());

    await db.prepare('UPDATE pets SET owner_user_id = ? WHERE owner_email = ? AND owner_user_id IS NULL')
      .run(info.lastInsertRowid, email);

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    req.session.userId = user.id;
    res.json(publicUser(user));
  }));

  // ── Login ────────────────────────────────────────────────────────────────
  r.post('/login', ah(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'invalid email or password' });

    req.session.userId = user.id;
    res.json(publicUser(user));
  }));

  // ── Forgot password ──────────────────────────────────────────────────────
  // Sends via SendGrid when SENDGRID_API_KEY + EMAIL_FROM are configured
  // (server/lib/email.js); otherwise falls back to handing the reset link
  // straight back to the caller for the UI to display, same as before email
  // was wired in.
  r.post('/forgot-password', ah(async (req, res) => {
    const { email: toEmail } = req.body || {};
    if (!toEmail) return res.status(400).json({ error: 'email is required' });

    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get(toEmail);
    if (!user) return res.status(404).json({ error: 'No account found with that email.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.prepare('UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?')
      .run(hashToken(token), expires, user.id);

    const origin = appOrigin(req);
    const resetUrl = `${origin}/reset-password.html?token=${token}`;
    const result = await email.send({
      to: toEmail,
      subject: 'Let\'s get you back in',
      html: email.shell({
        origin,
        title: 'Forgot your password? No worries.',
        bodyHtml: `<p>We got a request to reset the password on this Vitarus account. Happens to the best of us — click below and you'll be back in in no time.</p>
                   ${email.button('Choose a new password', resetUrl)}
                   <p style="margin-top:18px;color:#637784;font-size:12.5px;">This link is good for the next hour. If this wasn't you, no need to do anything — your account is still safe.</p>`
      })
    });

    // Only expose the raw link when no email was actually sent — once
    // SendGrid is configured, the reset link should only ever reach the
    // inbox it was requested for, not the API response.
    res.json(result.sent ? { ok: true } : { ok: true, resetUrl: `/reset-password.html?token=${token}` });
  }));

  // ── Reset password ───────────────────────────────────────────────────────
  r.post('/reset-password', ah(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

    const user = await db.prepare('SELECT * FROM users WHERE reset_token_hash = ?').get(hashToken(token));
    if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date())
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });

    const password_hash = bcrypt.hashSync(password, 10);
    await db.prepare('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL, updated_at = ? WHERE id = ?')
      .run(password_hash, nowISO(), user.id);

    res.json({ ok: true });
  }));

  // ── Logout ───────────────────────────────────────────────────────────────
  r.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  // ── Me ───────────────────────────────────────────────────────────────────
  r.get('/me', ah(async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'not signed in' });
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(401).json({ error: 'not signed in' });
    res.json(publicUser(user));
  }));

  // ── Update own profile (any role) ────────────────────────────────────────
  r.patch('/profile', requireAuth, ah(async (req, res) => {
    const allowed = ['name', 'phone', 'specialty', 'clinic_name', 'address'];
    const updates = {};
    for (const key of allowed) {
      if (req.body && key in req.body) updates[key] = req.body[key] || null;
    }
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: 'no updatable fields provided' });

    updates.updated_at = nowISO();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.user.id];
    await db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(publicUser(user));
  }));

  // ── Create clinic account (admin / super_admin) ──────────────────────────
  // Staff/vet/admin all belong to a lab. super_admin picks any lab for the
  // new account; admin's new accounts are forced into their own lab.
  r.post('/users', requireAuth, ah(async (req, res) => {
    if (!isAdmin(req.user))
      return res.status(403).json({ error: 'not permitted for this role' });

    const { email, password, name, role } = req.body || {};
    if (!email || !password || !name || !role)
      return res.status(400).json({ error: 'email, password, name, and role are required' });

    // admin can create vet/staff; super_admin can also create admin
    const allowedRoles = req.user.role === 'super_admin'
      ? ['vet', 'staff', 'admin']
      : ['vet', 'staff'];
    if (!allowedRoles.includes(role))
      return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(', ')}` });

    if (password.length < 8)
      return res.status(400).json({ error: 'password must be at least 8 characters' });

    let lab_id;
    if (req.user.role === 'super_admin') {
      lab_id = req.body.lab_id != null ? Number(req.body.lab_id) : null;
      if (lab_id != null && !(await db.prepare('SELECT id FROM labs WHERE id = ?').get(lab_id)))
        return res.status(400).json({ error: 'lab_id does not reference an existing lab' });
    } else {
      lab_id = req.user.lab_id || null;
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'an account with that email already exists' });

    const password_hash = bcrypt.hashSync(password, 10);
    const info = await db.prepare(
      'INSERT INTO users (email, password_hash, role, name, lab_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(email, password_hash, role, name, lab_id, nowISO());

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.json(publicUser(user));
  }));

  // ── List clinic accounts (admin / super_admin) ───────────────────────────
  // Clinic roles only (vet/staff/admin/super_admin) for both — owner accounts
  // are managed via the pets/exams they're attached to, not this table, and
  // mixing them in here would make the lab filter (below) incoherent since
  // owners don't belong to a lab. super_admin sees every lab; admin sees
  // only their own lab's accounts. Joins labs for a display-ready lab_name
  // rather than making the frontend resolve lab_id itself.
  r.get('/users', requireAuth, ah(async (req, res) => {
    if (!isAdmin(req.user))
      return res.status(403).json({ error: 'not permitted for this role' });

    let rows;
    if (req.user.role === 'super_admin') {
      rows = await db.prepare(`
        SELECT u.id, u.email, u.role, u.name, u.phone, u.specialty, u.clinic_name, u.address,
               u.lab_id, l.name AS lab_name, u.created_at, u.updated_at
        FROM users u LEFT JOIN labs l ON l.id = u.lab_id
        WHERE u.role != 'owner'
        ORDER BY u.created_at DESC
      `).all();
    } else {
      rows = await db.prepare(`
        SELECT u.id, u.email, u.role, u.name, u.phone, u.specialty, u.clinic_name, u.address,
               u.lab_id, l.name AS lab_name, u.created_at, u.updated_at
        FROM users u LEFT JOIN labs l ON l.id = u.lab_id
        WHERE u.role != 'owner' AND u.lab_id = ?
        ORDER BY u.created_at DESC
      `).all(req.user.lab_id || -1);
    }
    res.json(rows);
  }));

  // ── Edit a clinic account (admin: own lab's vet/staff only; super_admin: anyone) ──
  // Broader than the role/lab-only patch below — covers the profile fields
  // too, for the Clinic Accounts table's "Edit" action. Any subset of fields
  // may be provided; omitted ones are left unchanged.
  //
  // A regular admin's scope mirrors account CREATION's existing restriction
  // (admin can create vet/staff; only super_admin can create/edit admin
  // accounts) — same reasoning applied here so an admin can't edit a peer
  // admin, promote someone to admin, or move an account to a different lab
  // out from under their own oversight.
  r.patch('/users/:id', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'user not found' });
    if (target.role === 'owner') return res.status(400).json({ error: 'owner accounts are not managed here' });

    const isSuperAdmin = req.user.role === 'super_admin';
    if (!isSuperAdmin) {
      if (target.lab_id !== req.user.lab_id) return res.status(403).json({ error: 'not permitted for this lab' });
      if (!['vet', 'staff'].includes(target.role)) return res.status(403).json({ error: 'not permitted for this account' });
    }

    const { name, email, phone, specialty, clinic_name, address, role, lab_id } = req.body || {};
    const validRoles = isSuperAdmin ? ['vet', 'staff', 'admin', 'super_admin'] : ['vet', 'staff'];
    if (role !== undefined && !validRoles.includes(role))
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    if (email !== undefined) {
      const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, target.id);
      if (existing) return res.status(409).json({ error: 'another account already uses that email' });
    }
    let newLabId = target.lab_id;
    if (lab_id !== undefined) {
      newLabId = lab_id === null ? null : Number(lab_id);
      if (!isSuperAdmin && newLabId !== req.user.lab_id)
        return res.status(403).json({ error: 'admins cannot move accounts to a different lab' });
      if (newLabId != null && !(await db.prepare('SELECT id FROM labs WHERE id = ?').get(newLabId)))
        return res.status(400).json({ error: 'lab_id does not reference an existing lab' });
    }

    await db.prepare(`
      UPDATE users SET name = ?, email = ?, phone = ?, specialty = ?, clinic_name = ?, address = ?,
        role = ?, lab_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name : target.name,
      email !== undefined ? email : target.email,
      phone !== undefined ? phone : target.phone,
      specialty !== undefined ? specialty : target.specialty,
      clinic_name !== undefined ? clinic_name : target.clinic_name,
      address !== undefined ? address : target.address,
      role !== undefined ? role : target.role,
      newLabId,
      nowISO(),
      target.id
    );

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);
    res.json(publicUser(updated));
  }));

  // ── Delete a clinic account (admin: own lab's vet/staff only; super_admin: anyone) ──
  // A staff/vet account tied to existing pets/exams (created_by, assigned
  // vet, signed_by, or event actor — see server/db.js's REFERENCES users(id)
  // columns, none ON DELETE CASCADE) fails at the DB level with a foreign-
  // key violation (Postgres 23503) — caught here as a clear 409 instead of
  // a raw 500, since deleting exam history out from under signed reports
  // isn't something this endpoint should silently allow anyway.
  //
  // Scope mirrors the PATCH rule above: admin can only delete vet/staff
  // accounts that belong to their own lab; super_admin can delete any
  // non-owner account.
  r.delete('/users/:id', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id)
      return res.status(400).json({ error: 'you cannot delete your own account' });

    const target = await db.prepare('SELECT id, role, lab_id FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'user not found' });
    if (target.role === 'owner') return res.status(400).json({ error: 'owner accounts are not managed here' });

    const isSuperAdmin = req.user.role === 'super_admin';
    if (!isSuperAdmin) {
      // admin: can only delete vet/staff in their own lab
      if (!['vet', 'staff'].includes(target.role))
        return res.status(403).json({ error: 'not permitted for this account' });
      if (target.lab_id !== req.user.lab_id)
        return res.status(403).json({ error: 'not permitted for this lab' });
    }

    try {
      await db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    } catch (err) {
      if (err.code === '23503') {
        return res.status(409).json({ error: 'This account has existing pets or exams tied to it and can\'t be deleted — reassign or remove those first.' });
      }
      throw err;
    }
    res.json({ ok: true });
  }));

  // ── List vets (for staff to assign exams) ────────────────────────────────
  // staff/admin only see vets in their own lab; super_admin sees all
  // (optionally filtered with ?lab_id=) since they aren't tied to one lab.
  r.get('/users/vets', requireAuth, requireRole('staff', 'admin', 'super_admin'), ah(async (req, res) => {
    let vets;
    if (req.user.role === 'super_admin') {
      const labId = req.query.lab_id ? Number(req.query.lab_id) : null;
      vets = labId
        ? await db.prepare("SELECT id, name, email, specialty, lab_id FROM users WHERE role = 'vet' AND lab_id = ? ORDER BY name ASC").all(labId)
        : await db.prepare("SELECT id, name, email, specialty, lab_id FROM users WHERE role = 'vet' ORDER BY name ASC").all();
    } else {
      vets = await db.prepare(
        "SELECT id, name, email, specialty, lab_id FROM users WHERE role = 'vet' AND lab_id = ? ORDER BY name ASC"
      ).all(req.user.lab_id || -1);
    }
    res.json(vets);
  }));

  // ── Update any user's role and/or lab assignment (super_admin only) ──────
  r.patch('/users/:id/role', requireAuth, requireRole('super_admin'), ah(async (req, res) => {
    const { role, lab_id } = req.body || {};
    const validRoles = ['owner', 'vet', 'staff', 'admin', 'super_admin'];
    if (role && !validRoles.includes(role))
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    if (!role && lab_id === undefined)
      return res.status(400).json({ error: 'role and/or lab_id must be provided' });

    const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'user not found' });

    let newLabId = target.lab_id;
    if (lab_id !== undefined) {
      newLabId = lab_id === null ? null : Number(lab_id);
      if (newLabId != null && !(await db.prepare('SELECT id FROM labs WHERE id = ?').get(newLabId)))
        return res.status(400).json({ error: 'lab_id does not reference an existing lab' });
    }

    await db.prepare('UPDATE users SET role = ?, lab_id = ?, updated_at = ? WHERE id = ?')
      .run(role || target.role, newLabId, nowISO(), target.id);

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);
    res.json(publicUser(updated));
  }));

  return r;
}

/** Attaches req.user when a session exists; does not itself require one. */
function attachUser(db) {
  return ah(async (req, res, next) => {
    if (req.session && req.session.userId) {
      req.user = (await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)) || null;
    }
    next();
  });
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'sign in required' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'sign in required' });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'not permitted for this role' });
    next();
  };
}

module.exports = { router, attachUser, requireAuth, requireRole, publicUser, isAdmin, hashToken };
