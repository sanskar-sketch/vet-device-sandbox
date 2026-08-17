/**
 * js/clinical-map.js
 *
 * A compact patient status strip (species-accurate silhouette + pulsing
 * per-system indicator dots) above a spacious, evenly-wrapping grid of
 * instrument cards. Shared by the Hardware Detection step and the Run Exam
 * step — same visual language, different dock content per step.
 */

/* ── Patient breed photos (X-ray style, transparent, upscaled + sharpened
   from vitarus_animals/) — one canonical aspect ratio per species so a
   single anchor map works across every breed in that species. ────────────── */

const BREED_LIST = {
  Canine: [
    { key: "labrador", label: "Labrador Retriever" },
    { key: "golden_retriever", label: "Golden Retriever" },
    { key: "german_shepherd", label: "German Shepherd" },
    { key: "beagle", label: "Beagle" },
    { key: "poodle", label: "Poodle" }
  ],
  Feline: [
    { key: "siamese", label: "Siamese" },
    { key: "persian", label: "Persian" },
    { key: "maine_coon", label: "Maine Coon" },
    { key: "ragdoll", label: "Ragdoll" },
    { key: "british_shorthair", label: "British Shorthair" }
  ]
};

const SPECIES_ASPECT = { Canine: 1.3413, Feline: 1.6462 };

function breedImagePath(species, breedKey) {
  const list = BREED_LIST[species] || BREED_LIST.Canine;
  const key = list.some(b => b.key === breedKey) ? breedKey : list[0].key;
  return `/assets/breeds/${key}.webp`;
}

/* ── Anchor points (percent of the breed image's own bounding box) ──────────── */

const ANCHORS_BY_SPECIES = {
  Canine: {
    patientStation: { x: 17.0, y: 16.0 },
    thermal:        { x: 58.0, y: 25.0 },
    structural:     { x: 72.0, y: 38.0 },
    cardiac:        { x: 29.0, y: 40.0 },
    ultrasound:     { x: 46.0, y: 48.0 },
    blood:          { x: 25.0, y: 68.0 },
    gait:           { x: 80.0, y: 74.0 }
  },
  Feline: {
    patientStation: { x: 18.0, y: 24.0 },
    thermal:        { x: 56.0, y: 34.0 },
    structural:     { x: 68.0, y: 50.0 },
    cardiac:        { x: 27.0, y: 40.0 },
    ultrasound:     { x: 42.0, y: 52.0 },
    blood:          { x: 24.0, y: 58.0 },
    gait:           { x: 68.0, y: 74.0 }
  }
};

/* ── Instrument specs: input / process / output / requirements ──────────────── */

const INSTRUMENT_SPECS = {
  patientStation: {
    input: "USB-HID microchip reader (ISO 11784/11785), RS-232 load-cell scale, USB3 BCS camera frame",
    process: "Chip ID lookup + registry match, stable-weight debounce, body-condition capture",
    output: "Microchip ID, weight (kg), body-condition reference photo",
    requirements: "USB-HID + Serial COM7 → ws://localhost:8097/patient"
  },
  thermal: {
    input: "640×480 radiometric IR sensor, ≤50 mK sensitivity, 30 Hz frame rate + ambient temp/humidity probe",
    process: "Spot/box ROI sampling → bilateral asymmetry + inflammation CNN, environmental calibration correction",
    output: "Thermal asymmetry map, heat index, inflammation score, pain probability, calibration confidence",
    requirements: "Tripod/motorized arm, blackbody reference → REST http://{ip}/api : 80"
  },
  ultrasound: {
    input: "192-element microconvex probe, 3–10 MHz, raw IQ @ up to 52 MHz sample rate",
    process: "B-mode reconstruction → organ segmentation + lesion detection model",
    output: "Organ segmentation, lesion measurements, fluid detection, tumour probability",
    requirements: "Gel warmer, probe holder → Cast API TCP 5828 → ws://localhost:8092/clarius"
  },
  cardiac: {
    input: "6-lead ECG @ 500 Hz + digital stethoscope audio + integrated SpO2/NIBP module",
    process: "QRS detection + rhythm classifier, murmur-grade audio model, HRV (SDNN), oscillometric BP + pulse-ox analysis",
    output: "Rhythm, murmur grade, HRV, SpO2 %, NIBP sys/dia/MAP, cardiac risk score",
    requirements: "BT-Link lead set + pulse-ox clip + NIBP cuff → ws://localhost:8093/vemo (192.168.1.50:3000)"
  },
  blood: {
    input: "2 µL capillary/venous sample, chemistry + CBC rotors",
    process: "Photometric/impedance analysis → panel flagging + disease-likelihood model",
    output: "22+ biomarker panel, organ health scores, disease likelihood, metabolic age",
    requirements: "Serial/ASTM E1394 → ws://localhost:8095/vetscan (REST fallback :8096)"
  },
  gait: {
    input: "48×64 sensel pressure mat @ 100 Hz, per-frame force + center-of-pressure",
    process: "Stride segmentation → left/right load-symmetry + lameness-grading model",
    output: "Lameness grade, gait symmetry, joint loading, weight distribution, mobility score",
    requirements: "COM SDK → ws://localhost:8094/tekscan, 6–8 m walkway"
  },
  structural: {
    input: "ToF depth stream (640×576) + RGB, point-cloud capture",
    process: "3D reconstruction → body-condition + muscle-symmetry model",
    output: "Body condition score, muscle symmetry, surface lesions, growth tracking",
    requirements: "USB 3.0/Ethernet → ws://localhost:8091/orbbec"
  }
};

/** Sweep tint per instrument — keeps the "what's scanning right now" story readable at a glance. */
const SCAN_COLORS = {
  thermal: '211,85,74',
  ultrasound: '221,156,73',
  cardiac: '190,50,69',
  structural: '16,130,127',
  gait: '61,118,176',
  blood: '117,65,125',
  patientStation: '23,144,138'
};

function specBlockHTML(key) {
  const s = INSTRUMENT_SPECS[key];
  if (!s) return '';
  return `<div class="spec-block">
    <details class="spec-details" open>
      <summary>Full spec</summary>
      <div class="spec-row"><span class="spec-label">In</span>${s.input}</div>
      <div class="spec-row"><span class="spec-label">Proc</span>${s.process}</div>
      <div class="spec-row"><span class="spec-label">Out</span>${s.output}</div>
      <div class="spec-row"><span class="spec-label">Req</span>${s.requirements}</div>
    </details>
  </div>`;
}

/* ── ClinicalMap component ──────────────────────────────────────────────────── */

class ClinicalMap {
  /**
   * @param {HTMLElement} container
   * @param {'Canine'|'Feline'} species
   * @param {Array<{key,icon,name}>} leftMods
   * @param {Array<{key,icon,name}>} rightMods
   * @param {Array<{key,icon,name}>} topMods (optional, e.g. Patient Station)
   * @param {string} breedKey (optional — defaults to the first breed for the species)
   */
  constructor(container, species, leftMods, rightMods, topMods = [], breedKey = null) {
    this.container = container;
    this.species = ANCHORS_BY_SPECIES[species] ? species : 'Canine';
    this.breedKey = breedKey;
    this.left = leftMods;
    this.right = rightMods;
    this.top = topMods;
    this.all = [...topMods, ...leftMods, ...rightMods];
    this._render();
  }

  destroy() {}

  _dockCard(mod) {
    return `
      <div class="dock-card idle" id="dock-${mod.key}" style="--mod-color:${mod.color || 'var(--brand-teal)'};">
        <div class="dock-head">
          <span class="dock-icon">${mod.icon}</span>
          <span class="dock-name">${mod.name}</span>
          <span class="dock-pill idle" id="dock-${mod.key}-pill">Idle</span>
        </div>
        <div class="dock-status" id="dock-${mod.key}-status"></div>
        <div class="dock-body" id="dock-${mod.key}-body">${specBlockHTML(mod.key)}</div>
      </div>`;
  }

  _render() {
    const aspect = SPECIES_ASPECT[this.species] || 1.4;
    const imgSrc = breedImagePath(this.species, this.breedKey);

    this.container.innerHTML = `
      <div class="clinical-map">
        <div class="map-overview">
          <div class="map-silhouette" style="--aspect:${aspect};">
            <img class="patient-img" src="${imgSrc}" alt="${this.species} patient diagram">
            <div class="scan-sweep" id="scan-sweep" style="-webkit-mask-image:url('${imgSrc}');mask-image:url('${imgSrc}');"></div>
            <div class="radar-sweep" id="radar-sweep" style="-webkit-mask-image:url('${imgSrc}');mask-image:url('${imgSrc}');"></div>
            <div class="scan-glints" id="scan-glints" style="-webkit-mask-image:url('${imgSrc}');mask-image:url('${imgSrc}');"></div>
            ${this.all.map(m => `<div class="anchor-dot idle" id="anchor-${m.key}" title="${m.name}" style="--mod-color:${m.color || 'var(--brand-teal)'};"><span class="anchor-label">${m.icon}</span></div>`).join('')}
          </div>
          <div class="map-overview-legend">
            <div class="map-overview-title">${this.all.length} instruments in this bay</div>
            <div class="map-overview-hint">Dot color on the diagram mirrors each card's status below — green once captured, blue while scanning.</div>
          </div>
        </div>
        <div class="dock-grid">${this.all.map(m => this._dockCard(m)).join('')}</div>
      </div>`;

    // Position anchor dots by percentage
    const anchors = ANCHORS_BY_SPECIES[this.species];
    this.all.forEach(m => {
      const a = anchors[m.key];
      if (!a) return;
      const el = this.container.querySelector(`#anchor-${m.key}`);
      el.style.left = a.x + '%';
      el.style.top = a.y + '%';
    });
  }

  recomputeConnectors() {}

  /**
   * @param {string} key
   * @param {'idle'|'active'|'done'|'fail'} state
   * @param {{label?:string, status?:string, bodyHtml?:string}} opts
   */
  setState(key, state, opts = {}) {
    const card = this.container.querySelector(`#dock-${key}`);
    const pill = this.container.querySelector(`#dock-${key}-pill`);
    const anchor = this.container.querySelector(`#anchor-${key}`);
    const statusEl = this.container.querySelector(`#dock-${key}-status`);
    const bodyEl = this.container.querySelector(`#dock-${key}-body`);
    if (!card) return;

    card.classList.remove('idle', 'active', 'done', 'fail');
    card.classList.add(state);
    if (anchor) { anchor.classList.remove('idle', 'active', 'done', 'fail'); anchor.classList.add(state); }
    if (pill) {
      pill.classList.remove('idle', 'active', 'done', 'fail');
      pill.classList.add(state);
      pill.textContent = opts.label || { idle: 'Idle', active: 'Scanning', done: 'Online', fail: 'Error' }[state];
    }
    if (statusEl && opts.status !== undefined) statusEl.textContent = opts.status;
    if (bodyEl && opts.bodyHtml !== undefined) bodyEl.innerHTML = opts.bodyHtml;

    if (this.all.some(m => m.key === key)) this.setScanning(key, state === 'active');
  }

  setStatus(key, text) {
    const statusEl = this.container.querySelector(`#dock-${key}-status`);
    if (statusEl) statusEl.textContent = text;
  }

  /** Tints and toggles the full-body scan sweep for whichever instrument is currently active. */
  setScanning(key, active) {
    const sweep = this.container.querySelector('#scan-sweep');
    const radar = this.container.querySelector('#radar-sweep');
    const glints = this.container.querySelector('#scan-glints');
    const silhouette = this.container.querySelector('.map-silhouette');
    const anchor = this.container.querySelector(`#anchor-${key}`);
    const card = this.container.querySelector(`#dock-${key}`);
    const color = SCAN_COLORS[key] || '23,144,138';
    if (!sweep) return;
    const overlays = [sweep, radar, glints].filter(Boolean);
    if (active) {
      overlays.forEach(el => { el.style.setProperty('--scan-color', color); el.classList.add('active'); });
      if (silhouette) silhouette.style.setProperty('--scan-color', color);
      if (anchor) anchor.style.setProperty('--scan-color', color);
      if (card) card.style.setProperty('--scan-color', color);
    } else if (sweep.style.getPropertyValue('--scan-color') === color) {
      overlays.forEach(el => el.classList.remove('active'));
      if (silhouette) silhouette.style.removeProperty('--scan-color');
    }
  }
}
