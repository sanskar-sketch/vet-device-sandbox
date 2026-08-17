# Vitarus routes

| URL | File | Purpose |
|---|---|---|
| `/` | `index.html` | Public landing page and product positioning |
| `/login.html` | `login.html` | Sign in and owner registration |
| `/staff/index.html` | `staff/index.html` | Clinic intake, hardware detection, exam capture and fusion report |
| `/vet/index.html` | `vet/index.html` | Pending review, patient history, sign and release |
| `/owner/index.html` | `owner/index.html` | Owner pets and signed reports |
| `/admin/index.html` | `admin/index.html` | Live operational dashboard, labs, users and machines |
| `/devices/*.html` | `devices/` | Standalone simulated hardware consoles |
| `/param-explorer.html` | `param-explorer.html` | Developer parameter reference |
| `/universal-fetcher.html` | `universal-fetcher.html` | Developer request builder |

The backend is `server/services/web.js`; it serves the static app and API/WebSocket simulation endpoints from one Railway service.

