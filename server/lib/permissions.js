/**
 * server/lib/permissions.js
 *
 * What each role may do, and which labs a user may act on.
 *
 * Roles themselves are fixed — there is no role-creation. What's editable is
 * the permission set attached to 'admin' and 'staff', and which labs an admin
 * covers. Both are super_admin-only operations.
 *
 * Two deliberate exclusions:
 *
 *   super_admin is always allowed everything and is not stored in
 *   role_permissions at all. If its own permissions were editable, one bad
 *   save could remove the ability to undo that save — the console that grants
 *   permissions would lock out the only account able to fix it.
 *
 *   owner and vet keep fixed sets. An owner's access is scoped to their own
 *   pets by identity, not by role permission; making it toggleable would let a
 *   clinic grant one owner reach into another's records.
 *
 * Permission is necessary but never sufficient: every route also scopes by
 * lab (see labsFor). "Can this role accept appointments" and "may this user
 * accept THIS appointment" are separate questions, and dropping the second is
 * how an admin at one clinic would gain reach into another's.
 */

/** The catalogue. Editing a role's set means toggling these keys. */
const PERMISSIONS = [
  { key: 'appointments.view',    label: 'View appointment requests',      group: 'Appointments' },
  { key: 'appointments.handle',  label: 'Accept, decline or offer a time', group: 'Appointments' },
  { key: 'availability.manage',  label: 'Block and unblock clinic time',   group: 'Appointments' },
  { key: 'schedule.manage',      label: 'Set opening hours and slot length', group: 'Appointments' },

  { key: 'exams.create',         label: 'Run an exam',                     group: 'Clinical' },
  { key: 'exams.view',           label: 'View submitted exams',            group: 'Clinical' },
  { key: 'patients.view',        label: 'Look up patient records',         group: 'Clinical' },
  { key: 'patients.create',      label: 'Create patient records',          group: 'Clinical' },

  { key: 'lab.edit',             label: 'Edit lab name and address',       group: 'Lab' },
  { key: 'machines.manage',      label: 'Add, edit and remove machines',   group: 'Lab' },

  { key: 'accounts.view',        label: 'View clinic accounts',            group: 'Accounts' },
  { key: 'accounts.create',      label: 'Create clinic accounts',          group: 'Accounts' },
  { key: 'accounts.edit',        label: 'Edit clinic accounts',            group: 'Accounts' },
  { key: 'accounts.delete',      label: 'Delete clinic accounts',          group: 'Accounts' }
];

const PERMISSION_KEYS = PERMISSIONS.map(p => p.key);
const EDITABLE_ROLES = ['admin', 'staff'];

/**
 * Starting sets, applied once on first boot. These reproduce exactly what
 * each role could already do before permissions existed, so enabling this
 * feature changes nobody's access until a super_admin edits something.
 */
const DEFAULT_PERMISSIONS = {
  admin: [
    'appointments.view', 'appointments.handle', 'availability.manage', 'schedule.manage',
    'exams.view', 'patients.view',
    'lab.edit', 'machines.manage',
    'accounts.view', 'accounts.create', 'accounts.edit', 'accounts.delete'
  ],
  staff: [
    'appointments.view', 'appointments.handle', 'availability.manage',
    'exams.create', 'exams.view', 'patients.view', 'patients.create'
  ]
};

/** Roles whose capability set is fixed in code rather than in the database. */
const FIXED_ROLE_PERMISSIONS = {
  super_admin: PERMISSION_KEYS,
  vet: ['exams.view', 'patients.view', 'appointments.view', 'appointments.handle'],
  owner: []
};

let cache = null;   // { admin: Set, staff: Set } — invalidated on every write

async function loadRolePermissions(db) {
  if (cache) return cache;
  const rows = await db.prepare('SELECT role, permission, allowed FROM role_permissions').all();
  const next = { admin: new Set(), staff: new Set() };
  for (const r of rows) if (r.allowed && next[r.role]) next[r.role].add(r.permission);
  cache = next;
  return cache;
}

function invalidate() { cache = null; }

/** Seeds the default sets once; never overwrites a set a super_admin edited. */
async function seedDefaults(db, pool) {
  for (const role of EDITABLE_ROLES) {
    for (const key of PERMISSION_KEYS) {
      await pool.query(
        `INSERT INTO role_permissions (role, permission, allowed)
         VALUES ($1, $2, $3) ON CONFLICT (role, permission) DO NOTHING`,
        [role, key, DEFAULT_PERMISSIONS[role].includes(key)]
      );
    }
  }
  invalidate();
}

async function hasPermission(db, user, key) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const fixed = FIXED_ROLE_PERMISSIONS[user.role];
  if (fixed) return fixed.includes(key);
  const perms = await loadRolePermissions(db);
  return Boolean(perms[user.role] && perms[user.role].has(key));
}

/** Every permission key this user currently holds — sent to the client so the UI can hide what the API would refuse. */
async function permissionsFor(db, user) {
  if (!user) return [];
  if (user.role === 'super_admin') return [...PERMISSION_KEYS];
  const fixed = FIXED_ROLE_PERMISSIONS[user.role];
  if (fixed) return [...fixed];
  const perms = await loadRolePermissions(db);
  return perms[user.role] ? [...perms[user.role]] : [];
}

/**
 * The labs a user may act on.
 *
 * super_admin: null, meaning "no restriction" — callers treat null as
 * unscoped rather than as an empty set, which would deny everything.
 * admin: their user_labs rows, falling back to their home lab_id so an admin
 * created before multi-lab existed still works.
 * everyone else: exactly their own lab.
 */
async function labsFor(db, user) {
  if (!user) return [];
  if (user.role === 'super_admin') return null;
  if (user.role === 'admin') {
    const rows = await db.prepare('SELECT lab_id FROM user_labs WHERE user_id = ?').all(user.id);
    const ids = rows.map(r => r.lab_id);
    if (!ids.length && user.lab_id) return [user.lab_id];
    return ids;
  }
  return user.lab_id ? [user.lab_id] : [];
}

async function canActOnLab(db, user, labId) {
  const labs = await labsFor(db, user);
  if (labs === null) return true;
  return labs.includes(Number(labId));
}

/** Express guard. Pairs with requireRole — role says who, this says what. */
function requirePermission(db, key) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'sign in required' });
      if (await hasPermission(db, req.user, key)) return next();
      res.status(403).json({ error: `your role does not have permission to ${key.replace('.', ' ')}` });
    } catch (err) { next(err); }
  };
}

module.exports = {
  PERMISSIONS, PERMISSION_KEYS, EDITABLE_ROLES, DEFAULT_PERMISSIONS,
  seedDefaults, invalidate, hasPermission, permissionsFor,
  labsFor, canActOnLab, requirePermission
};
