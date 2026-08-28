/**
 * server/lib/availability.js
 *
 * Turns a lab's opening hours, appointment length, accepted bookings and
 * staff-declared blocks into the concrete list of times an owner can pick.
 *
 * Slots are computed, never stored. The persisted facts are only: when the
 * lab is open (lab_hours), how long one appointment takes (labs.slot_minutes),
 * what has been accepted (appointments), and what staff have blocked out
 * (slot_blocks). Deriving the grid from those means changing opening hours
 * or appointment length is a single UPDATE with nothing to migrate — the
 * alternative, materialising slot rows, would need every future slot
 * regenerated and reconciled against existing bookings on every such edit.
 *
 * A slot is offered only when it is open, unbooked, unblocked and not in the
 * past. Everything else is returned too, labelled with *why* it isn't
 * available, so the UI can show a full day at a glance rather than a
 * suspiciously short list.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const toMinutes = t => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = mins =>
  String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');

/**
 * The weekday of a YYYY-MM-DD string in *calendar* terms.
 *
 * `new Date('2026-09-15')` parses as UTC midnight, so in any negative-offset
 * timezone it reports the previous day — which would read Monday's hours for
 * a Tuesday booking. Constructing from parts keeps it local and literal.
 */
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function overlaps(slotStart, slotEnd, blockStart, blockEnd) {
  return slotStart < blockEnd && slotEnd > blockStart;
}

/**
 * @returns {Promise<{open: boolean, reason?: string, slot_minutes: number,
 *                    opens_at?: string, closes_at?: string,
 *                    slots: Array<{time, end_time, status, detail?}>}>}
 *   status is one of: available | booked | held | blocked | pending | past
 */
async function availabilityFor(db, labId, dateStr, opts = {}) {
  if (!DATE_RE.test(dateStr)) throw Object.assign(new Error('date must be YYYY-MM-DD'), { status: 400 });

  const lab = await db.prepare('SELECT id, name, slot_minutes FROM labs WHERE id = ?').get(labId);
  if (!lab) throw Object.assign(new Error('lab not found'), { status: 404 });
  const slotMinutes = lab.slot_minutes || 30;

  const hours = await db.prepare('SELECT * FROM lab_hours WHERE lab_id = ? AND weekday = ?')
    .get(labId, weekdayOf(dateStr));

  if (!hours || !hours.is_open) {
    return { open: false, reason: 'The clinic is closed on this day.', slot_minutes: slotMinutes, slots: [] };
  }

  const openMin = toMinutes(hours.opens_at);
  const closeMin = toMinutes(hours.closes_at);
  if (closeMin <= openMin) {
    return { open: false, reason: 'The clinic has no bookable hours set for this day.', slot_minutes: slotMinutes, slots: [] };
  }

  const [booked, offered, blocks] = await Promise.all([
    db.prepare(
      "SELECT requested_time, status FROM appointments WHERE lab_id = ? AND requested_date = ? AND status IN ('accepted','pending')"
    ).all(labId, dateStr),
    // A slot the clinic has offered to a specific owner is held until they
    // answer. Not holding it would just move the conflict: staff resolve a
    // clash by offering 11:15, and someone else books 11:15 first.
    db.prepare(
      "SELECT id, proposed_time FROM appointments WHERE lab_id = ? AND proposed_date = ? AND status = 'proposed'"
    ).all(labId, dateStr),
    db.prepare('SELECT start_time, end_time, reason FROM slot_blocks WHERE lab_id = ? AND block_date = ?')
      .all(labId, dateStr)
  ]);

  const acceptedAt = new Set(booked.filter(b => b.status === 'accepted').map(b => b.requested_time));
  const pendingAt = new Set(booked.filter(b => b.status === 'pending').map(b => b.requested_time));
  // When staff are re-offering a different time for one request, that
  // request's own current offer must not read as taken to itself.
  const offeredAt = new Set(
    offered.filter(o => o.id !== opts.ignoreAppointmentId).map(o => o.proposed_time)
  );

  // "Past" is relative to now only for today; a whole past date is past.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = dateStr === todayStr;
  const isPastDate = dateStr < todayStr;

  const slots = [];
  // A slot must finish by closing time — a 30-minute appointment can't start
  // at 16:45 in a lab that closes at 17:00.
  for (let start = openMin; start + slotMinutes <= closeMin; start += slotMinutes) {
    const time = toTime(start);
    const end = start + slotMinutes;
    let status = 'available';
    let detail;

    if (isPastDate || (isToday && start <= nowMin)) {
      status = 'past';
    } else if (acceptedAt.has(time)) {
      status = 'booked';
    } else if (offeredAt.has(time)) {
      status = 'held';
    } else {
      const hit = blocks.find(b => overlaps(start, end, toMinutes(b.start_time), toMinutes(b.end_time)));
      if (hit) {
        status = 'blocked';
        detail = hit.reason || null;
      } else if (pendingAt.has(time)) {
        // Still selectable: a pending request holds nothing until staff
        // accept it, and hiding the slot would let one unanswered request
        // silently take a time nobody has actually been given.
        status = 'pending';
      }
    }
    slots.push({ time, end_time: toTime(end), status, ...(detail ? { detail } : {}) });
  }

  const result = {
    open: true, slot_minutes: slotMinutes,
    opens_at: hours.opens_at, closes_at: hours.closes_at, slots
  };
  if (opts.includeLabName) result.lab_name = lab.name;
  return result;
}

/** True when `time` is a slot an owner is allowed to request on that date. */
async function isSelectable(db, labId, dateStr, time, opts = {}) {
  if (!TIME_RE.test(time)) return { ok: false, error: 'requested_time must be HH:MM' };
  const avail = await availabilityFor(db, labId, dateStr, opts);
  if (!avail.open) return { ok: false, error: avail.reason };
  const slot = avail.slots.find(s => s.time === time);
  if (!slot) return { ok: false, error: 'That time is not one of the clinic\'s appointment slots.' };
  if (slot.status === 'past') return { ok: false, error: 'That slot is in the past.' };
  if (slot.status === 'booked') return { ok: false, error: 'That slot has already been booked.' };
  if (slot.status === 'blocked') return { ok: false, error: 'The clinic has marked that time unavailable.' };
  if (slot.status === 'held') return { ok: false, error: 'That slot is being held for another owner.' };
  return { ok: true };
}

module.exports = { availabilityFor, isSelectable, toMinutes, toTime, weekdayOf };
