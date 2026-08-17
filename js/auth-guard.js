/**
 * js/auth-guard.js
 *
 * Client-side companion to server/lib/auth.js. Every role-gated page
 * (staff/vet/owner/admin) calls AuthGuard.requireRole(...) on load; it
 * redirects to /login.html if the session is missing or the role doesn't
 * match, and otherwise returns the signed-in user so the page can render.
 * Replaces the old shared-password js/access-gate.js on these pages.
 */
const AuthGuard = {
  async requireRole(...allowedRoles) {
    let user;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) { location.href = '/login.html'; return null; }
      user = await res.json();
    } catch {
      location.href = '/login.html';
      return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      location.href = '/login.html';
      return null;
    }
    return user;
  },

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/login.html';
  },

  /**
   * Injects a "Signed in as X (role) · Log out" strip into the given container.
   * Clinic roles (staff/vet/admin/super_admin) also get an "Owner Portal
   * preview" toggle, on by default whenever the page they're on is already
   * under /owner/ — flipping it navigates to/from the Owner Portal.
   */
  renderStrip(user, container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const roleHome = { staff: '/staff/index.html', vet: '/vet/index.html', admin: '/admin/index.html', super_admin: '/admin/index.html' }[user.role] || '/';
    const showToggle = user.role !== 'owner';
    const onOwnerPortal = location.pathname.startsWith('/owner/');
    el.innerHTML = `
      <div class="auth-strip">
        ${showToggle ? `
          <label class="owner-preview-toggle" title="Preview the Owner Portal">
            <input type="checkbox" id="owner-preview-switch" ${onOwnerPortal ? 'checked' : ''}>
            <span class="switch"></span>
            Owner Portal preview
          </label>
        ` : ''}
        <span class="auth-strip-name">${user.name}</span>
        <span class="auth-strip-role">${user.role}</span>
        <button class="auth-strip-logout" type="button">Log out</button>
      </div>`;
    if (showToggle) {
      el.querySelector('#owner-preview-switch').addEventListener('change', e => {
        location.href = e.target.checked ? '/owner/index.html' : roleHome;
      });
    }
    el.querySelector('.auth-strip-logout').addEventListener('click', () => AuthGuard.logout());
  }
};
