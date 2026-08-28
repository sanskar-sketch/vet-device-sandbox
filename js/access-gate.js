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
    background:#0f3350;
    display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  `;

  overlay.innerHTML = `
    <div style="width:100%;max-width:380px;padding:0 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:34px;font-weight:700;
          letter-spacing:3.4px;line-height:1.15;color:#fff;">VIT<span
          style="border-bottom:4px solid #2bb5a6;padding-bottom:6px;">A</span>RUS</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:3.9px;
          color:#9fbbd0;margin-top:18px;">ANIMAL DIAGNOSTICS</div>
        <p style="color:#8fa9bf;font-size:13px;margin:22px 0 0;">Enter password to continue</p>
      </div>

      <div style="background:rgba(255,255,255,.05);border:1px solid rgba(159,187,208,.22);border-radius:12px;padding:24px;">
        <div style="margin-bottom:16px;">
          <label style="display:block;color:#9fbbd0;font-size:11px;font-weight:600;
            text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Password</label>
          <div style="position:relative;">
            <input id="gate-input" type="password" placeholder="Enter password"
              style="width:100%;box-sizing:border-box;background:rgba(8,32,52,.6);border:1px solid rgba(159,187,208,.28);
              border-radius:8px;color:#eef5fa;padding:13px 46px 13px 13px;font-size:16px;
              outline:none;transition:border-color .15s;"
              autocomplete="off" autofocus />
            <button id="gate-toggle" tabindex="-1"
              aria-label="Show password"
              style="position:absolute;right:2px;top:50%;transform:translateY(-50%);
              background:none;border:none;cursor:pointer;color:#9fbbd0;font-size:15px;
              width:44px;height:44px;display:flex;align-items:center;justify-content:center;padding:0;">
              👁
            </button>
          </div>
          <div id="gate-error" style="color:#ff9f97;font-size:12px;margin-top:8px;
            min-height:18px;display:none;">Incorrect password. Try again.</div>
        </div>

        <button id="gate-submit"
          style="width:100%;background:#2bb5a6;color:#0b2c47;border:none;border-radius:8px;
          padding:13px;font-size:15px;font-weight:700;min-height:46px;cursor:pointer;transition:background .15s;">
          Unlock →
        </button>
      </div>

      <p style="text-align:center;color:#6d8ba5;font-size:11px;margin-top:16px;">
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
      const shown = input.type === 'password';
      input.type = shown ? 'text' : 'password';
      toggle.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
    });

    // Focus styling
    input.addEventListener('focus',  () => input.style.borderColor = '#2bb5a6');
    input.addEventListener('blur',   () => input.style.borderColor = 'rgba(159,187,208,.28)');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    input.addEventListener('input',  () => { error.style.display = 'none'; });
    submit.addEventListener('click', attempt);
    submit.addEventListener('mouseenter', () => submit.style.background = '#3ecab9');
    submit.addEventListener('mouseleave', () => submit.style.background = '#2bb5a6');

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
        setTimeout(() => { input.style.borderColor = 'rgba(159,187,208,.28)'; }, 1500);
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
