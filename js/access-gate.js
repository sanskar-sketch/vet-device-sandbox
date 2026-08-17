/**
 * js/access-gate.js
 * Password gate for the entire site.
 * Include this as the FIRST script on every page.
 * Password is checked against a SHA-256 hash — plain text never stored.
 */

(async function () {
  const PASSWORD = 'chelsea26';
  const SESSION_KEY = 'vet_sandbox_auth';

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Already authenticated this session
  if (sessionStorage.getItem(SESSION_KEY) === 'granted') return;

  // Build gate overlay
  const overlay = document.createElement('div');
  overlay.id = 'access-gate';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:#0d1117;
    display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  `;

  overlay.innerHTML = `
    <div style="width:100%;max-width:380px;padding:0 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:48px;margin-bottom:12px;">🐾</div>
        <h1 style="color:#e6edf3;font-size:22px;font-weight:700;margin:0 0 6px;">Vitarus</h1>
        <p style="color:#7d8590;font-size:13px;margin:0;">Enter password to continue</p>
      </div>

      <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:24px;">
        <div style="margin-bottom:16px;">
          <label style="display:block;color:#7d8590;font-size:11px;font-weight:600;
            text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Password</label>
          <div style="position:relative;">
            <input id="gate-input" type="password" placeholder="Enter password"
              style="width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;
              border-radius:6px;color:#e6edf3;padding:10px 40px 10px 12px;font-size:14px;
              outline:none;transition:border-color .15s;"
              autocomplete="off" autofocus />
            <button id="gate-toggle" tabindex="-1"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
              background:none;border:none;cursor:pointer;color:#7d8590;font-size:14px;padding:0;">
              👁
            </button>
          </div>
          <div id="gate-error" style="color:#ff7b72;font-size:12px;margin-top:8px;
            min-height:18px;display:none;">Incorrect password. Try again.</div>
        </div>

        <button id="gate-submit"
          style="width:100%;background:#238636;color:#fff;border:none;border-radius:6px;
          padding:10px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s;">
          Unlock →
        </button>
      </div>

      <p style="text-align:center;color:#484f58;font-size:11px;margin-top:16px;">
        Session-based · closes when browser tab closes
      </p>
    </div>
  `;

  // Block page scroll while gate is shown
  document.documentElement.style.overflow = 'hidden';

  // Wait for DOM then append
  function mount() {
    document.body.appendChild(overlay);

    const input  = document.getElementById('gate-input');
    const submit = document.getElementById('gate-submit');
    const error  = document.getElementById('gate-error');
    const toggle = document.getElementById('gate-toggle');

    // Show/hide password
    toggle.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Focus styling
    input.addEventListener('focus',  () => input.style.borderColor = '#1f6feb');
    input.addEventListener('blur',   () => input.style.borderColor = '#30363d');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    input.addEventListener('input',  () => { error.style.display = 'none'; });
    submit.addEventListener('click', attempt);
    submit.addEventListener('mouseenter', () => submit.style.background = '#2ea043');
    submit.addEventListener('mouseleave', () => submit.style.background = '#238636');

    async function attempt() {
      const val = input.value.trim();
      if (!val) return;

      submit.disabled = true;
      submit.textContent = 'Checking…';

      const hash = await sha256(val);
      const realHash = await sha256(PASSWORD);

      if (hash === realHash) {
        sessionStorage.setItem(SESSION_KEY, 'granted');
        overlay.style.transition = 'opacity .3s';
        overlay.style.opacity = '0';
        document.documentElement.style.overflow = '';
        setTimeout(() => overlay.remove(), 300);
      } else {
        error.style.display = 'block';
        input.value = '';
        input.style.borderColor = '#da3633';
        setTimeout(() => { input.style.borderColor = '#30363d'; }, 1500);
        submit.disabled = false;
        submit.textContent = 'Unlock →';
        input.focus();
      }
    }
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();
