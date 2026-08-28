/**
 * server/db.js
 *
 * The one shared database behind every Vitarus interface — Postgres
 * (Supabase) via `pg`, accessed through a thin shim that keeps the same
 * db.prepare(sql).get/all/run(...params) shape the rest of the codebase
 * already used with better-sqlite3. The shim is async (Postgres has no
 * synchronous driver) and translates '?' placeholders to $1/$2/... so no
 * call site needs its SQL text rewritten.
 *
 * Schema changes are additive — `ADD COLUMN IF NOT EXISTS` runs
 * unconditionally on every boot, so existing data is never lost.
 *
 * Callers must `await db.ready` once at startup before issuing queries.
 */
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { nowISO } = require('./lib/utils');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required (Postgres connection string).\n' +
    'For local development, put one in a .env file at the repo root — it is\n' +
    'gitignored, and npm start loads it via node --env-file-if-exists:\n' +
    '  DATABASE_URL=postgres://<user>@localhost:5432/vitarus_dev\n' +
    'Point it at a scratch database, not the deployed one: the schema below\n' +
    'runs on every boot and seedDemoAccounts() writes demo logins.'
  );
}

// Managed Postgres (Supabase, Render, RDS) terminates TLS with a cert chain
// node won't verify by default, hence rejectUnauthorized:false. A local
// server usually has SSL compiled off entirely and rejects the handshake
// outright, so asking for TLS there fails the connection rather than
// securing it — decided per host, not globally.
function sslFor(connectionString) {
  let host = '';
  try { host = new URL(connectionString).hostname; } catch { /* leave blank */ }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  return isLocal ? false : { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslFor(process.env.DATABASE_URL),
});

function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Wraps anything with a pg-style `.query(sql, params)` in the prepare().get/all/run shape. */
function wrap(query) {
  return {
    prepare(sql) {
      const pgSql = toPositional(sql);
      const isBareInsert = /^\s*INSERT/i.test(sql) && !/RETURNING/i.test(sql);
      const runSql = isBareInsert ? `${pgSql} RETURNING id` : pgSql;
      return {
        async get(...params) {
          const res = await query(pgSql, params);
          return res.rows[0] || null;
        },
        async all(...params) {
          const res = await query(pgSql, params);
          return res.rows;
        },
        async run(...params) {
          const res = await query(runSql, params);
          return { lastInsertRowid: res.rows[0] ? res.rows[0].id : undefined, changes: res.rowCount };
        },
      };
    },
  };
}

const db = wrap((sql, params) => pool.query(sql, params));

// ── Schema ───────────────────────────────────────────────────────────────
async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('owner','vet','staff','admin','super_admin')),
      name          TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pets (
      id            SERIAL PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id),
      owner_email   TEXT,
      name          TEXT NOT NULL,
      species       TEXT NOT NULL,
      breed         TEXT,
      breed_key     TEXT,
      sex           TEXT,
      age_years     REAL,
      weight_kg     REAL,
      microchip     TEXT,
      color         TEXT,
      allergies     TEXT,
      medical_notes TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exams (
      id                   SERIAL PRIMARY KEY,
      pet_id               INTEGER NOT NULL REFERENCES pets(id),
      created_by_user_id   INTEGER REFERENCES users(id),
      assigned_vet_user_id INTEGER REFERENCES users(id),
      status               TEXT NOT NULL CHECK(status IN ('awaiting_review','signed')) DEFAULT 'awaiting_review',
      report_json          TEXT NOT NULL,
      ai_narrative         TEXT,
      vet_notes            TEXT,
      signed_by_user_id    INTEGER REFERENCES users(id),
      signed_at            TEXT,
      created_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exam_events (
      id            SERIAL PRIMARY KEY,
      exam_id       INTEGER NOT NULL REFERENCES exams(id),
      actor_user_id INTEGER REFERENCES users(id),
      action        TEXT NOT NULL,
      detail        TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS labs (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      address       TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lab_machines (
      id            SERIAL PRIMARY KEY,
      lab_id        INTEGER NOT NULL REFERENCES labs(id),
      name          TEXT NOT NULL,
      machine_type  TEXT,
      state         TEXT NOT NULL CHECK(state IN ('operational','maintenance','offline')) DEFAULT 'operational',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id                 SERIAL PRIMARY KEY,
      owner_user_id      INTEGER NOT NULL REFERENCES users(id),
      pet_id             INTEGER REFERENCES pets(id),
      lab_id             INTEGER NOT NULL REFERENCES labs(id),
      requested_date     TEXT NOT NULL,
      requested_time     TEXT NOT NULL,
      reason             TEXT,
      status             TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')) DEFAULT 'pending',
      handled_by_user_id INTEGER REFERENCES users(id),
      handled_at         TEXT,
      decline_reason     TEXT,
      created_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pets_owner_user    ON pets(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_pets_owner_email   ON pets(owner_email);
    CREATE INDEX IF NOT EXISTS idx_exams_pet          ON exams(pet_id);
    CREATE INDEX IF NOT EXISTS idx_exams_status       ON exams(status);
    CREATE INDEX IF NOT EXISTS idx_exams_created_by   ON exams(created_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_exam_events_exam   ON exam_events(exam_id);
    CREATE INDEX IF NOT EXISTS idx_lab_machines_lab   ON lab_machines(lab_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_owner ON appointments(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_lab   ON appointments(lab_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    -- The actual double-booking guard: at most one ACCEPTED appointment per
    -- lab/date/time, enforced at the DB level (not just in application code)
    -- so a race between two staff accepting overlapping requests can't both
    -- win. Declined/pending/cancelled rows are excluded so a lab can hold
    -- many pending requests for the same slot until one is accepted.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot_lock
      ON appointments(lab_id, requested_date, requested_time) WHERE status = 'accepted';
  `);

  // ── Additive columns — safe to re-run against an existing database ───────
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone        TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty    TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_name  TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS address      TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at   TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lab_id       INTEGER REFERENCES labs(id);
    ALTER TABLE exams ADD COLUMN IF NOT EXISTS assigned_vet_user_id INTEGER REFERENCES users(id);
    ALTER TABLE pets  ADD COLUMN IF NOT EXISTS color         TEXT;
    ALTER TABLE pets  ADD COLUMN IF NOT EXISTS allergies     TEXT;
    ALTER TABLE pets  ADD COLUMN IF NOT EXISTS medical_notes TEXT;
    ALTER TABLE pets  ADD COLUMN IF NOT EXISTS breed_group   TEXT;
    ALTER TABLE pets  ADD COLUMN IF NOT EXISTS breed_size    TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash    TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TEXT;
    ALTER TABLE pets  ADD COLUMN IF NOT EXISTS has_photo     BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE exams ADD COLUMN IF NOT EXISTS corrected_at     TEXT;
    ALTER TABLE exams ADD COLUMN IF NOT EXISTS correction_note  TEXT;
  `);

  // Pet photo bytes live in their own table, never in a plain `SELECT * FROM
  // pets` — that query backs pet lists/search everywhere, and inlining a
  // multi-hundred-KB image into every one of those rows would bloat every
  // list/search response. pets.has_photo (above) is the cheap flag the
  // frontend checks to decide whether to request GET /pets/:id/photo at all.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_photos (
      pet_id       INTEGER PRIMARY KEY REFERENCES pets(id) ON DELETE CASCADE,
      photo_data   BYTEA NOT NULL,
      content_type TEXT NOT NULL,
      uploaded_at  TEXT NOT NULL
    );
  `);
}

// ── Default lab (bootstraps the multi-lab model) ────────────────────────────
async function ensureDefaultLab() {
  let lab = await db.prepare('SELECT * FROM labs ORDER BY id ASC LIMIT 1').get();
  if (!lab) {
    const info = await db.prepare('INSERT INTO labs (name, address, created_at) VALUES (?, ?, ?)')
      .run('Vitarus Central Lab', '100 Harborview Dr, Springfield', nowISO());
    lab = await db.prepare('SELECT * FROM labs WHERE id = ?').get(info.lastInsertRowid);
  }
  return lab;
}

async function seedDemoMachines(defaultLab) {
  const existing = await db.prepare('SELECT COUNT(*) AS n FROM lab_machines WHERE lab_id = ?').get(defaultLab.id);
  if (Number(existing.n) > 0) return;
  const machines = [
    { name: 'Orbbec LiDAR Scanner',        machine_type: 'lidar',       state: 'operational' },
    { name: 'Clarius Handheld Ultrasound', machine_type: 'ultrasound',  state: 'operational' },
    { name: 'VEMO Auscultation Device',    machine_type: 'bioacoustic', state: 'maintenance' },
    { name: 'Tekscan Force Plate',         machine_type: 'force_plate', state: 'operational' },
  ];
  for (const m of machines) {
    await db.prepare('INSERT INTO lab_machines (lab_id, name, machine_type, state, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(defaultLab.id, m.name, m.machine_type, m.state, nowISO());
  }
}

// ── Demo accounts ──────────────────────────────────────────────────────────
async function seedDemoAccounts(defaultLab) {
  const demo = [
    { email: 'vet@vitarus.demo',        role: 'vet',         name: 'Dr. Amara Whitfield', lab_id: defaultLab.id },
    { email: 'staff@vitarus.demo',       role: 'staff',       name: 'Jordan Reyes',        lab_id: defaultLab.id },
    { email: 'admin@vitarus.demo',       role: 'admin',       name: 'Sanskar',             lab_id: defaultLab.id },
    { email: 'superadmin@vitarus.demo',  role: 'super_admin', name: 'Super Admin',         lab_id: null          },
  ];
  const password_hash = bcrypt.hashSync('demo1234', 10);

  for (const a of demo) {
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(a.email);
    if (existing) {
      await db.prepare('UPDATE users SET name = ?, role = ?, lab_id = ? WHERE id = ?')
        .run(a.name, a.role, a.lab_id, existing.id);
    } else {
      await db.prepare('INSERT INTO users (email, password_hash, role, name, lab_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(a.email, password_hash, a.role, a.name, a.lab_id, nowISO());
    }
  }

  console.log('\nDemo accounts (password for all: demo1234):');
  demo.forEach(a => console.log(`  ${a.role.padEnd(12)} → ${a.email}`));
  console.log(`Default lab: "${defaultLab.name}" (id ${defaultLab.id})`);
  console.log('Register an owner account from the login page — owners are not seeded.\n');
}

db.ready = (async () => {
  await createSchema();
  const defaultLab = await ensureDefaultLab();
  await seedDemoMachines(defaultLab);
  await seedDemoAccounts(defaultLab);
})();

module.exports = db;
