/**
 * server/lib/appointments-api.js
 *
 * Owner-initiated appointment requests: an owner picks a clinic (lab), date
 * and time; every staff/vet/admin at that lab is emailed and sees it in
 * their portal; whoever accepts first locks that lab/date/time slot (a
 * partial unique index in server/db.js is the actual guarantee — this file
 * also pre-checks for a friendlier error than a raw constraint violation)
 * and the owner gets a confirmation email. Declining works the same way
 * without locking anything, so the owner isn't left wondering.
 *
 * Deliberately simple on purpose: this is a request/accept flow, not a full
 * computed-availability calendar — the owner proposes a time, the clinic
 * either takes it or doesn't. No new UI concept beyond what already exists
 * elsewhere in this app (date/time inputs, a status-tagged list, an
 * accept/decline pair).
 */
const express = require('express');
const { nowISO, appOrigin } = require('./utils');
const { requireAuth, requireRole } = require('./auth');
const { ah } = require('./async-handler');
const email = require('./email');
const { availabilityFor, isSelectable } = require('./availability');

const CLINIC_ROLES = ['staff', 'vet', 'admin']; // super_admin is platform-wide, not tied to one lab's inbox
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function prettyDate(dateStr) {
  return new Date(dateStr + 'T00:00:00')
    .toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function serializeAppointment(db, row) {
  const [lab, pet, owner, handledBy] = await Promise.all([
    db.prepare('SELECT id, name, address FROM labs WHERE id = ?').get(row.lab_id),
    row.pet_id ? db.prepare('SELECT id, name, species, breed FROM pets WHERE id = ?').get(row.pet_id) : null,
    db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.owner_user_id),
    row.handled_by_user_id ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.handled_by_user_id) : null
  ]);
  return { ...row, lab, pet, owner, handled_by_name: handledBy ? handledBy.name : null };
}

function router(db) {
  const r = express.Router();

  /**
   * Emails every clinic-role account at the appointment's lab.
   *
   * Same recipient rule as a new request: there's no "who's on duty" concept,
   * so the whole clinic side of that lab is told. super_admin is excluded —
   * it's a platform role, not a member of any one clinic's inbox.
   */
  async function notifyClinic(req, appt, subject, bodyHtml) {
    const staff = await db.prepare(
      `SELECT email FROM users WHERE lab_id = ? AND role IN (${CLINIC_ROLES.map(() => '?').join(',')})`
    ).all(appt.lab_id, ...CLINIC_ROLES);
    if (!staff.length) return;
    const origin = appOrigin(req);
    await Promise.all(staff.map(sMember => email.send({
      to: sMember.email,
      subject,
      html: email.shell({
        origin, title: subject,
        bodyHtml: bodyHtml + email.button('Open the clinic dashboard', `${origin}/staff/index.html`)
      })
    })));
  }

  // ── Owner requests an appointment ─────────────────────────────────────────
  r.post('/appointments', requireAuth, requireRole('owner'), ah(async (req, res) => {
    const { lab_id, pet_id, requested_date, requested_time, reason } = req.body || {};
    if (!lab_id || !requested_date || !requested_time)
      return res.status(400).json({ error: 'lab_id, requested_date, and requested_time are required' });
    if (!DATE_RE.test(requested_date)) return res.status(400).json({ error: 'requested_date must be YYYY-MM-DD' });
    if (!TIME_RE.test(requested_time)) return res.status(400).json({ error: 'requested_time must be HH:MM' });

    const lab = await db.prepare('SELECT id, name FROM labs WHERE id = ?').get(lab_id);
    if (!lab) return res.status(400).json({ error: 'lab_id does not reference an existing clinic' });

    // The owner picks from a generated grid, so the server re-derives it
    // rather than trusting the submitted time: this rejects a stale tab
    // whose slot was booked or blocked since it loaded, and it also covers
    // the past-time and outside-opening-hours cases the old explicit checks
    // handled.
    const selectable = await isSelectable(db, Number(lab_id), requested_date, requested_time);
    if (!selectable.ok) return res.status(409).json({ error: selectable.error });

    if (pet_id) {
      const pet = await db.prepare('SELECT id FROM pets WHERE id = ? AND owner_user_id = ?').get(pet_id, req.user.id);
      if (!pet) return res.status(400).json({ error: 'pet_id must be one of your own pets' });
    }

    const info = await db.prepare(`
      INSERT INTO appointments (owner_user_id, pet_id, lab_id, requested_date, requested_time, reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(req.user.id, pet_id || null, Number(lab_id), requested_date, requested_time, reason || null, nowISO());

    const row = await db.prepare('SELECT * FROM appointments WHERE id = ?').get(info.lastInsertRowid);
    const appt = await serializeAppointment(db, row);

    // Every clinic-role account at this lab gets the heads-up — there's no
    // "who's on duty" concept yet, so this is the only coherent default.
    const staffAtLab = await db.prepare(
      `SELECT email, name FROM users WHERE lab_id = ? AND role IN (${CLINIC_ROLES.map(() => '?').join(',')})`
    ).all(lab_id, ...CLINIC_ROLES);
    if (staffAtLab.length) {
      const origin = appOrigin(req);
      const petLine = appt.pet ? `${appt.pet.name} (${appt.pet.species}${appt.pet.breed ? ', ' + appt.pet.breed : ''})` : 'a patient';
      const when = `${new Date(requested_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${requested_time}`;
      await Promise.all(staffAtLab.map(s => email.send({
        to: s.email,
        subject: `New appointment request — ${petLine}`,
        html: email.shell({
          origin,
          title: 'A new appointment request is waiting',
          bodyHtml: `<p><b>${appt.owner.name}</b> requested an appointment for <b>${petLine}</b> at ${lab.name}.</p>
                     <p><b>Requested:</b> ${when}</p>
                     ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}
                     <p>Accept it to lock in the slot, or let them know if it doesn't work.</p>
                     ${email.button('Review request', `${origin}/staff/index.html`)}`
        })
      })));
    }

    res.json(appt);
  }));

  // ── Bookable slots for one lab on one date ───────────────────────────────
  // Any signed-in role: owners pick from it, clinic staff see the same grid
  // when deciding what to block.
  r.get('/labs/:id/availability', requireAuth, ah(async (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    try {
      res.json(await availabilityFor(db, Number(req.params.id), date, { includeLabName: true }));
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }));

  // ── Staff-declared unavailability ────────────────────────────────────────
  // An offline booking, an emergency, an early close. Staff manage their own
  // lab's blocks; super_admin can act on any.
  function canBlockFor(user, labId) {
    return user.role === 'super_admin' || labId === user.lab_id;
  }

  r.get('/labs/:id/blocks', requireAuth, requireRole(...CLINIC_ROLES, 'super_admin'), ah(async (req, res) => {
    const labId = Number(req.params.id);
    if (!canBlockFor(req.user, labId)) return res.status(403).json({ error: 'not permitted for this clinic' });
    const rows = req.query.date
      ? await db.prepare('SELECT * FROM slot_blocks WHERE lab_id = ? AND block_date = ? ORDER BY start_time').all(labId, req.query.date)
      : await db.prepare('SELECT * FROM slot_blocks WHERE lab_id = ? AND block_date >= ? ORDER BY block_date, start_time')
          .all(labId, nowISO().slice(0, 10));
    res.json(rows);
  }));

  r.post('/labs/:id/blocks', requireAuth, requireRole(...CLINIC_ROLES, 'super_admin'), ah(async (req, res) => {
    const labId = Number(req.params.id);
    if (!canBlockFor(req.user, labId)) return res.status(403).json({ error: 'not permitted for this clinic' });

    const { block_date, start_time, end_time, reason } = req.body || {};
    if (!block_date || !start_time || !end_time)
      return res.status(400).json({ error: 'block_date, start_time and end_time are required' });
    if (!DATE_RE.test(block_date)) return res.status(400).json({ error: 'block_date must be YYYY-MM-DD' });
    if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time))
      return res.status(400).json({ error: 'start_time and end_time must be HH:MM' });
    if (end_time <= start_time) return res.status(400).json({ error: 'end_time must be after start_time' });

    // Blocking time that is already accepted would silently strand a booked
    // owner, so it's refused with the clash named rather than applied.
    const clash = await db.prepare(
      "SELECT requested_time FROM appointments WHERE lab_id = ? AND requested_date = ? AND status = 'accepted' AND requested_time >= ? AND requested_time < ?"
    ).all(labId, block_date, start_time, end_time);
    if (clash.length)
      return res.status(409).json({
        error: `That range already has ${clash.length} accepted appointment(s) at ${clash.map(c => c.requested_time).join(', ')}. Decline or move them first.`
      });

    const info = await db.prepare(`
      INSERT INTO slot_blocks (lab_id, block_date, start_time, end_time, reason, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(labId, block_date, start_time, end_time, reason || null, req.user.id, nowISO());
    res.json(await db.prepare('SELECT * FROM slot_blocks WHERE id = ?').get(info.lastInsertRowid));
  }));

  r.delete('/blocks/:blockId', requireAuth, requireRole(...CLINIC_ROLES, 'super_admin'), ah(async (req, res) => {
    const block = await db.prepare('SELECT * FROM slot_blocks WHERE id = ?').get(req.params.blockId);
    if (!block) return res.status(404).json({ error: 'block not found' });
    if (!canBlockFor(req.user, block.lab_id)) return res.status(403).json({ error: 'not permitted for this clinic' });
    await db.prepare('DELETE FROM slot_blocks WHERE id = ?').run(block.id);
    res.json({ ok: true });
  }));

  // ── Owner: their own requests, any status ─────────────────────────────────
  r.get('/appointments/mine', requireAuth, requireRole('owner'), ah(async (req, res) => {
    const rows = await db.prepare('SELECT * FROM appointments WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(await Promise.all(rows.map(row => serializeAppointment(db, row))));
  }));

  // ── Clinic: requests for their own lab (super_admin: all, or ?lab_id=) ────
  r.get('/appointments', requireAuth, requireRole('staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const status = req.query.status;
    let rows;
    if (req.user.role === 'super_admin') {
      const labId = req.query.lab_id ? Number(req.query.lab_id) : null;
      rows = labId
        ? await db.prepare('SELECT * FROM appointments WHERE lab_id = ? ORDER BY requested_date ASC, requested_time ASC').all(labId)
        : await db.prepare('SELECT * FROM appointments ORDER BY requested_date ASC, requested_time ASC').all();
    } else {
      rows = await db.prepare('SELECT * FROM appointments WHERE lab_id = ? ORDER BY requested_date ASC, requested_time ASC').all(req.user.lab_id || -1);
    }
    if (status) rows = rows.filter(a => a.status === status);
    res.json(await Promise.all(rows.map(row => serializeAppointment(db, row))));
  }));

  // ── Clinic accepts — locks the slot ────────────────────────────────────────
  r.post('/appointments/:id/accept', requireAuth, requireRole('staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const row = await db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'appointment request not found' });
    if (req.user.role !== 'super_admin' && row.lab_id !== req.user.lab_id)
      return res.status(403).json({ error: 'not permitted for this clinic' });
    if (row.status !== 'pending') return res.status(409).json({ error: `already ${row.status}` });

    // Friendlier than the raw unique-violation the DB index would throw —
    // that index is still the actual guarantee under a race, this is just
    // the common-case nice error.
    const clash = await db.prepare(
      "SELECT id FROM appointments WHERE lab_id = ? AND requested_date = ? AND requested_time = ? AND status = 'accepted'"
    ).get(row.lab_id, row.requested_date, row.requested_time);
    if (clash) return res.status(409).json({ error: 'that slot was already booked by another accepted request' });

    // A request can sit pending across a change to the lab's hours or a
    // newly-added block, so the slot is re-validated at accept time rather
    // than trusting that it was bookable when it was raised.
    const stillOk = await isSelectable(db, row.lab_id, row.requested_date, row.requested_time);
    if (!stillOk.ok)
      return res.status(409).json({ error: `Can't accept — ${stillOk.error.charAt(0).toLowerCase() + stillOk.error.slice(1)}` });

    try {
      await db.prepare("UPDATE appointments SET status = 'accepted', handled_by_user_id = ?, handled_at = ? WHERE id = ?")
        .run(req.user.id, nowISO(), row.id);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'that slot was already booked by another accepted request' });
      throw err;
    }

    const updatedRow = await db.prepare('SELECT * FROM appointments WHERE id = ?').get(row.id);
    const appt = await serializeAppointment(db, updatedRow);

    if (appt.owner && appt.owner.email) {
      const origin = appOrigin(req);
      const petLine = appt.pet ? appt.pet.name : 'your pet';
      const when = `${new Date(appt.requested_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${appt.requested_time}`;
      await email.send({
        to: appt.owner.email,
        subject: `Appointment confirmed — ${when}`,
        html: email.shell({
          origin,
          title: `You're all set, ${appt.owner.name.split(' ')[0]}!`,
          bodyHtml: `<p>Your appointment for <b>${petLine}</b> at <b>${appt.lab.name}</b> is confirmed.</p>
                     <p><b>When:</b> ${when}</p>
                     ${appt.lab.address ? `<p><b>Where:</b> ${appt.lab.address}</p>` : ''}
                     <p>See you then! Reach out to the clinic directly if anything changes on your end.</p>`
        })
      });
    }

    res.json(appt);
  }));

  // ── Clinic offers a different time ───────────────────────────────────────
  // The middle ground between accept and decline: the requested slot doesn't
  // work (a clash, an emergency, a machine down) but the clinic still wants
  // the appointment. The original request is preserved alongside the offer
  // so the owner can see both, and declining the offer doesn't lose it.
  r.post('/appointments/:id/propose', requireAuth, requireRole('staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const row = await db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'appointment request not found' });
    if (req.user.role !== 'super_admin' && row.lab_id !== req.user.lab_id)
      return res.status(403).json({ error: 'not permitted for this clinic' });
    if (!['pending', 'proposed'].includes(row.status))
      return res.status(409).json({ error: `already ${row.status}` });

    const { proposed_date, proposed_time, note } = req.body || {};
    if (!proposed_date || !proposed_time)
      return res.status(400).json({ error: 'proposed_date and proposed_time are required' });
    if (!DATE_RE.test(proposed_date)) return res.status(400).json({ error: 'proposed_date must be YYYY-MM-DD' });
    if (!TIME_RE.test(proposed_time)) return res.status(400).json({ error: 'proposed_time must be HH:MM' });
    if (proposed_date === row.requested_date && proposed_time === row.requested_time)
      return res.status(400).json({ error: 'that is the time the owner already asked for' });

    // The offered slot has to be genuinely bookable, or the owner would be
    // sent to accept something that then fails. Its own current offer is
    // ignored so staff can revise an offer they already made.
    const ok = await isSelectable(db, row.lab_id, proposed_date, proposed_time, { ignoreAppointmentId: row.id });
    if (!ok.ok) return res.status(409).json({ error: ok.error });

    try {
      await db.prepare(`
        UPDATE appointments
        SET status = 'proposed', proposed_date = ?, proposed_time = ?, proposed_note = ?,
            proposed_by_user_id = ?, proposed_at = ?
        WHERE id = ?
      `).run(proposed_date, proposed_time, note || null, req.user.id, nowISO(), row.id);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'that slot has just been offered to another owner' });
      throw err;
    }

    const appt = await serializeAppointment(db, await db.prepare('SELECT * FROM appointments WHERE id = ?').get(row.id));

    if (appt.owner && appt.owner.email) {
      const origin = appOrigin(req);
      const petLine = appt.pet ? appt.pet.name : 'your pet';
      const when = `${prettyDate(proposed_date)} at ${proposed_time}`;
      const asked = `${prettyDate(row.requested_date)} at ${row.requested_time}`;
      await email.send({
        to: appt.owner.email,
        subject: `A different time for ${petLine} — ${when}`,
        html: email.shell({
          origin,
          title: `${appt.lab.name} suggested another time`,
          bodyHtml: `<p>You asked for <b>${asked}</b>, which the clinic can't do.</p>
                     <p>They've offered <b>${when}</b> for <b>${petLine}</b> instead${note ? '' : '.'}</p>
                     ${note ? `<p><b>Note from the clinic:</b> ${note}</p>` : ''}
                     <p>The slot is held for you until you answer.</p>
                     ${email.button('Accept or decline', `${origin}/owner/index.html`)}`
        })
      });
    }
    res.json(appt);
  }));

  // ── Owner answers the offer ──────────────────────────────────────────────
  r.post('/appointments/:id/proposal', requireAuth, requireRole('owner'), ah(async (req, res) => {
    const row = await db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'appointment not found' });
    if (row.owner_user_id !== req.user.id) return res.status(403).json({ error: 'not your appointment' });
    if (row.status !== 'proposed') return res.status(409).json({ error: 'there is no offer to answer' });

    const accept = (req.body || {}).accept === true;

    if (!accept) {
      await db.prepare("UPDATE appointments SET status = 'declined', decline_reason = ? WHERE id = ?")
        .run('Owner declined the clinic\'s suggested time', row.id);
      const appt = await serializeAppointment(db, await db.prepare('SELECT * FROM appointments WHERE id = ?').get(row.id));
      await notifyClinic(req, appt, `${appt.owner.name} turned down the suggested time`,
        `<p><b>${appt.owner.name}</b> declined ${prettyDate(row.proposed_date)} at ${row.proposed_time}.</p>
         <p>The slot is free again.</p>`);
      return res.json(appt);
    }

    // Re-checked at accept: the offer holds the slot, but the lab's hours may
    // have changed or a block may have been laid over it since.
    const ok = await isSelectable(db, row.lab_id, row.proposed_date, row.proposed_time, { ignoreAppointmentId: row.id });
    if (!ok.ok) return res.status(409).json({ error: ok.error });

    try {
      // The accepted time becomes the appointment's actual time, so the
      // existing accepted-slot unique index guards it like any other booking.
      await db.prepare(`
        UPDATE appointments
        SET status = 'accepted', requested_date = ?, requested_time = ?,
            handled_by_user_id = ?, handled_at = ?
        WHERE id = ?
      `).run(row.proposed_date, row.proposed_time, row.proposed_by_user_id, nowISO(), row.id);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'that slot was booked while you were deciding' });
      throw err;
    }

    const appt = await serializeAppointment(db, await db.prepare('SELECT * FROM appointments WHERE id = ?').get(row.id));
    await notifyClinic(req, appt, `${appt.owner.name} accepted ${prettyDate(appt.requested_date)} at ${appt.requested_time}`,
      `<p><b>${appt.owner.name}</b> accepted the time you suggested for
       <b>${appt.pet ? appt.pet.name : 'their pet'}</b>.</p>
       <p><b>Confirmed:</b> ${prettyDate(appt.requested_date)} at ${appt.requested_time}</p>`);
    res.json(appt);
  }));

  // ── Clinic declines — nothing locked, owner is told either way ───────────
  r.post('/appointments/:id/decline', requireAuth, requireRole('staff', 'vet', 'admin', 'super_admin'), ah(async (req, res) => {
    const row = await db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'appointment request not found' });
    if (req.user.role !== 'super_admin' && row.lab_id !== req.user.lab_id)
      return res.status(403).json({ error: 'not permitted for this clinic' });
    if (row.status !== 'pending') return res.status(409).json({ error: `already ${row.status}` });

    const declineReason = (req.body && req.body.reason) || null;
    await db.prepare("UPDATE appointments SET status = 'declined', handled_by_user_id = ?, handled_at = ?, decline_reason = ? WHERE id = ?")
      .run(req.user.id, nowISO(), declineReason, row.id);

    const updatedRow = await db.prepare('SELECT * FROM appointments WHERE id = ?').get(row.id);
    const appt = await serializeAppointment(db, updatedRow);

    if (appt.owner && appt.owner.email) {
      const origin = appOrigin(req);
      const petLine = appt.pet ? appt.pet.name : 'your pet';
      const when = `${new Date(appt.requested_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${appt.requested_time}`;
      await email.send({
        to: appt.owner.email,
        subject: `About your appointment request`,
        html: email.shell({
          origin,
          title: `${appt.lab.name} couldn't take that time`,
          bodyHtml: `<p>Unfortunately <b>${appt.lab.name}</b> couldn't accommodate your request for <b>${petLine}</b> on ${when}.</p>
                     ${declineReason ? `<p><b>Note from the clinic:</b> ${declineReason}</p>` : ''}
                     <p>Feel free to submit another request for a different time — sorry for the inconvenience.</p>
                     ${email.button('Request another time', `${origin}/owner/index.html`)}`
        })
      });
    }

    res.json(appt);
  }));

  return r;
}

module.exports = { router };
