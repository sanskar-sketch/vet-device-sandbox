# Vitarus — Multi-Modal Veterinary Diagnostic Platform

A non-sedated canine & feline screening platform with five role-based interfaces sharing one
database: clinic staff run the exam, a vet must review and sign off before anything is released,
and only then does the owner see it. **Every hardware module is simulated today; flip one config
flag to switch any module to real hardware.**

---

## Accounts & roles

The site requires real sign-in (`login.html`) — there is no shared password anymore. Four roles,
four separate interfaces, one SQLite database behind all of them (`server/data/vitarus.db`,
created and seeded automatically on first run):

| Role | Interface | Demo login |
|---|---|---|
| Public / prospect | `index.html` (landing page) | — |
| Clinic staff | `staff/index.html` — the exam wizard, ends in "Submit for Vet Review" | `staff@vitarus.demo` / `demo1234` |
| Vet | `vet/index.html` — pending queue, risk overrides, sign & release | `vet@vitarus.demo` / `demo1234` |
| Pet owner | `owner/index.html` — signed reports only, self-registered | Register from the login page |
| Admin | `admin/index.html` — live counts from the database | `admin@vitarus.demo` / `demo1234` |

Vet/staff/admin accounts are seeded because a demo has no ops process for issuing clinic
credentials; owners self-register, and a pet created by staff under an owner's email auto-links
to their account the moment they sign up. Nothing reaches the owner until a vet signs it —
enforced server-side (`server/lib/exams-api.js`), not just hidden in the UI.

## Overview

```
vitarus/
├── index.html                      ← Public landing page
├── login.html                      ← Sign in / owner self-registration
├── staff/index.html                ← Clinic Dashboard: patient intake → detect → exam → submit for review
├── vet/index.html                  ← Vet Portal: pending queue → review/override → sign & release
├── owner/index.html                ← Owner Portal: your pets → signed reports only
├── admin/index.html                ← Admin/Exec Console: live counts from the database
├── css/
│   ├── shared.css                  ← Dark theme, shared layout system, auth strip
│   ├── app.css                     ← Wizard + hardware-scan styling (staff only)
│   └── report.css                  ← Fusion report card — shared by staff/vet/owner
├── js/
│   ├── utils.js                    ← Logging, JSON highlighter, helpers
│   ├── auth-guard.js               ← Client-side role gate + "signed in as" strip + logout
│   ├── report-view.js              ← renderReport() — shared by staff/vet/owner, incl. vet override UI
│   ├── driver-base.js              ← ★ THE CONFIG FLAG + driver factory
│   ├── hardware-registry.js        ← Exact supported hardware models + ports per module
│   ├── hardware-scan.js            ← Simulated network/port discovery
│   ├── ai-analysis.js              ← Per-modality AI output layer (asymmetry, risk scores, etc.)
│   ├── fusion-engine.js            ← Combines modalities into one integrated assessment
│   ├── result-renderer.js          ← Shared UI primitives (stat grids, badges)
│   ├── mode-indicator.js           ← SIM/REAL banner (legacy per-device pages)
│   └── drivers/
│       ├── orbbec.js               ← Structural / depth imaging (sim + real)
│       ├── flir.js                 ← Thermal imaging (sim + real)
│       ├── clarius.js              ← Ultrasound (sim + real)
│       ├── vemo-tekscan-vetscan.js ← Cardiac ECG + Gait + Blood (sim + real)
│       └── patient-station.js      ← Patient intake: microchip, scale, BCS camera (sim + real)
├── devices/                        ← Legacy standalone consoles, one per driver (debugging only)
├── assets/breeds/                  ← X-ray style patient images, one per selectable breed (WebP)
└── server/                         ← The real backend — required now (not optional), since login
    │                                  and the shared database live here
    ├── index.js                    ← Starts the frontend + FLIR REST sim + all WS bridges + API
    ├── db.js                       ← SQLite schema (users/pets/exams/exam_events) + demo seed
    └── lib/
        ├── auth.js                 ← Login/register/session + requireRole middleware
        ├── pets-api.js             ← Client & Pet Registry endpoints
        ├── exams-api.js            ← Exam lifecycle: submit → override → sign, audit trail
        └── ...                     ← One file per simulated device, same wire protocol each RealDriver expects
```

### Patient images

`js/clinical-map.js` renders a species-and-breed-accurate patient diagram instead of a generic silhouette — 5 dog breeds and 5 cat breeds, selectable via the Breed dropdown on the intake step. Source photos live outside the repo tree in `vitarus_animals/`; the versions actually served from `assets/breeds/*.webp` have been background-keyed to transparent, cropped to content, padded to one shared aspect ratio per species (so a single anchor-point map lines up across every breed), upscaled ~3.5x, and sharpened. Instrument anchor points (`ANCHORS_BY_SPECIES`) are tuned against real anatomy on these images, not arbitrary coordinates.

`universal-fetcher.html` and `param-explorer.html` remain available as low-level request-builder / parameter-reference tools for developers; they are no longer part of the primary flow.

### Running the backend

The backend is required now — it's where login, the shared SQLite database, and the exam
sign-off workflow live, not just an optional network-proof-of-concept anymore:

```bash
cd server
npm install
npm start
```

This alone gives you the full platform: landing page, login, all four role interfaces, and every
diagnostic instrument running in simulated mode (`DeviceConfig.USE_REAL_DEVICE = false`, the
default) — plus a FLIR REST simulator (`:8098`) and WebSocket bridges for the other 6 devices
(`:8091`–`:8097`), the exact bridge processes the original design called for but never
implemented. That hardware-simulation flag is a separate, still-optional switch — flipping it
makes individual device drivers talk to those bridges over the network instead of generating data
in-browser, proving the wire protocol without touching login or the database at all. In
`js/driver-base.js`, set:

```javascript
USE_REAL_DEVICE: true,
flir: { ip: "localhost:8098", ... }
```

Every driver call now genuinely leaves the browser. Responses come back tagged `[SIM-BACKEND]` instead of `[SIM]` so it's obvious which path served them. When real hardware is available, only the internals of `server/lib/*.js` need to change — the frontend and the wire protocol stay identical.

### AI-generated clinical narrative (the one non-simulated piece)

Everything above is simulated end-to-end, including the fusion engine's scoring and reasoning (`js/fusion-engine.js` — real math, just running against synthetic sensor data). The report screen additionally offers one genuinely non-simulated step: an **AI Clinical Summary** synthesized by the actual Claude API from the already-computed fusion report.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
cd server && npm start
```

With the backend running and the key set, the report screen calls `POST /api/ai-narrative` (same-origin, `server/lib/ai-narrative.js`) with the structured fusion report and renders back a synthesized 3-paragraph clinical summary. No key, or no backend running at all → the section either shows a quiet "no API key" note or hides itself entirely; the rule-based report always stands on its own regardless.

---

## The App Flow

`index.html` is a 4-step wizard:

1. **Patient Station** — name, species, breed, sex, age, plus simulated microchip scan, weight capture, and body-condition photo.
2. **Hardware Detection** — probes every module's configured IP / port / WebSocket endpoint (see table below), showing a live scan console and per-device status cards.
3. **Run Exam** — captures data from all 6 clinical modalities and runs the AI analysis layer on each.
4. **AI Fusion Report** — combines every modality into one report: an overall health score, per-system risk (Skin, Heart, Musculoskeletal, Liver, Kidneys, Movement) with a confidence level based on cross-modality agreement, and recommended next steps.

---

## Key Architecture Decision

**The simulation logic and real hardware logic are completely separate**, and this now extends to the Patient Station too.

Each hardware module has **two drivers**:
- `*SimDriver` — generates realistic fake data (current default)
- `*RealDriver` — talks to real hardware

**The UI never knows which one it's using.** Both drivers implement the exact same methods and return identical JSON shapes.

### The One Flag That Switches Everything

Open `js/driver-base.js`:

```javascript
const DeviceConfig = {
  USE_REAL_DEVICE: false,   // ← Change this to `true`
  flir: { ip: "192.168.0.100", tempUnit: "C" },
  orbbec: { transport: "ethernet", ip: "192.168.1.100", wsEndpoint: "ws://localhost:8091/orbbec" },
  clarius: { probeIp: "192.168.1.1", castPort: 5828, wsEndpoint: "ws://localhost:8092/clarius" },
  vemo: { host: "192.168.1.50", port: 3000, wsEndpoint: "ws://localhost:8093/vemo" },
  tekscan: { wsEndpoint: "ws://localhost:8094/tekscan" },
  vetscan: { wsEndpoint: "ws://localhost:8095/vetscan", restEndpoint: "http://localhost:8096/api/vetscan" },
  patientStation: { wsEndpoint: "ws://localhost:8097/patient", scalePort: "COM7", rfidPort: "USB-HID" }
};
```

Refresh the page — the Hardware Detection step, and every exam capture, now talks to real hardware. The AI analysis and fusion layers are unchanged either way.

---

## Supported Hardware & Ports

Six diagnostic machines plus the Patient Station intake unit, per the Vitarus Platform Architecture Overview (v1.1) §5.4 — this is the canonical list in [`js/hardware-registry.js`](js/hardware-registry.js).

| Module | Exact Hardware Supported | Protocol | Port / Endpoint | Bridge Needed? |
|---|---|---|---|---|
| **Patient Station** | Generic USB-HID ISO 11784/11785 microchip reader, RS-232 weight scale, USB3 Vision BCS camera | USB-HID + Serial → WS | `ws://localhost:8097/patient` · scale `COM7` | Yes |
| **Structural / Depth Imaging** (3D body scanner) | Orbbec Femto Mega, Intel RealSense D455, Luxonis OAK-D, Azure Kinect | Orbbec SDK (USB 3.0 / Ethernet) → WS | `ws://localhost:8091/orbbec` · `192.168.1.100:8090` | Yes |
| **Thermal Imaging** | FLIR T865, FLIR A700, FLIR T540, FLIR A40/A50/A70, HIKMICRO, Testo | REST API (direct HTTP GET) | `http://{camera_ip}/api` · TCP 80 | No |
| **Ultrasound** | Clarius C7 Vet HD3, Clarius Wireless, Mindray, Butterfly (vet-compatible), Esaote | Cast API (TCP) → WS | `ws://localhost:8092/clarius` · probe TCP 5828 | Yes |
| **Cardiac** (ECG) | Bionet VEMO (6-lead ECG), wireless ECG patches, Eko / Thinklabs digital stethoscope, pulse oximeter, electronic BP monitor | Serial/TCP (BT-Link) → WS | `ws://localhost:8093/vemo` · `192.168.1.50:3000` | Yes |
| **Gait Analysis** (pressure-sensitive gait mat) | Tekscan Animal Strideway, Zebris pressure walkway, Intel RealSense / Azure Kinect / Sony global-shutter camera array | COM SDK → WS | `ws://localhost:8094/tekscan` · 48×64 mat @ 100 Hz | Yes |
| **Blood Laboratory** (in-clinic blood analyser) | Vetscan VS2, Vetscan OptiCell, IDEXX Catalyst, Heska, Zoetis, Mindray, Abaxis | Serial / ASTM E1394 → WS (or REST middleware) | `ws://localhost:8095/vetscan` · REST fallback `:8096/api/vetscan` | Yes |

### Why WebSocket Bridges?

Browsers can't access USB, serial ports, or native SDKs directly. Each real driver (other than FLIR, which has a built-in REST API) connects to a local Python/Node.js bridge that opens the device, exposes a WebSocket server, and forwards commands/data. See the original per-device pages under `devices/` for bridge stub examples.

---

## AI Analysis Layer (`js/ai-analysis.js`)

Sits between the raw sensor driver output and the fusion engine — the same layer a real deployment would replace with actual vision/signal/lab models:

| Modality | AI Outputs |
|---|---|
| Thermal | Thermal asymmetry map, heat index, inflammation score, pain probability, recovery trend |
| Ultrasound | Organ segmentation, lesion measurements, fluid detection, tumour probability score |
| Cardiac | Rhythm classification, murmur grade, cardiac risk score, HRV analysis |
| Blood | Organ-specific health scores, disease likelihood, metabolic age |
| Gait | Lameness grade, gait symmetry, joint loading, weight distribution, mobility score |
| Structural | Body condition score, muscle symmetry, lesion measurements, surface abnormality detection |

## Fusion Engine (`js/fusion-engine.js`)

Combines the six modality outputs into:
- **Organ-specific health scores** — Skin, Heart, Musculoskeletal, Liver, Kidneys, Movement
- **Disease-risk levels** (Low / Moderate / High) per system
- **Confidence** — derived from how many modalities agree on the finding
- **Overall health score** and a rule-based recommendation list (e.g. radiographs, SDMA repeat, echo, dermatology referral)

---

## Development Notes

### Testing Both Modes

1. Run through the wizard once with `USE_REAL_DEVICE: false` (default) to confirm the flow.
2. Flip the flag for the modules you have hardware/bridges for; leave the rest simulated — the app mixes sim and real per module automatically since it reads `DeviceConfig.USE_REAL_DEVICE` globally per driver factory call.
3. Re-run the Hardware Detection step — it uses the exact same `connect()` handshake the exam step relies on, so a passing scan means the exam will work too.

### Adding a New Device

1. Add a `*SimDriver` / `*RealDriver` pair to `js/drivers/`.
2. Register its config block in `DeviceConfig` and a case in `DriverFactory.get()` (`js/driver-base.js`).
3. Add an entry to `HARDWARE_REGISTRY` (`js/hardware-registry.js`) with its exact supported models, protocol, and port.
4. Write an `analyze*()` function in `js/ai-analysis.js` and wire its signals into `js/fusion-engine.js`.

---

## FAQ

**Q: Why not just mock the API calls directly?**
A: Separation of concerns. The UI and fusion logic are device-agnostic. You can test them against the sim drivers, then swap in real drivers for integration testing without touching a line of UI/AI code.

**Q: Do I need real hardware for every module?**
A: No. Set `USE_REAL_DEVICE = true` and fill in the config for whichever modules you have; the rest stay simulated.

**Q: What happened to the individual device pages?**
A: They still exist under `devices/` for low-level driver debugging (raw request/response JSON per device), but the primary experience is now the unified `index.html` flow.

---

## License

MIT. Use freely. No warranty. Not a replacement for clinical diagnosis.

---

**Stack:** Vanilla HTML/CSS/JS, no frameworks, no build step
**Modules:** Patient Station + 6 clinical modalities (Structural, Thermal, Ultrasound, Cardiac, Blood, Gait)
