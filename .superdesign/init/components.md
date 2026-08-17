# Vitarus UI components

This is a static HTML/CSS application with no component framework or UI library. Reusable UI is expressed through shared CSS classes and the `ClinicalMap` JavaScript renderer.

## Shared primitives

- `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-blue`: shared action buttons in `css/shared.css`.
- `.card` / `.card-header` / `.card-body`: shared surface containers in `css/shared.css`.
- `.form-group`, `input`, `select`, `textarea`: shared form controls in `css/shared.css`.
- `.status-pill`, `.tag-*`, `.state-pill`: shared status and module labels.
- `ClinicalMap`: `js/clinical-map.js`, renders the patient silhouette, instrument cards, scan overlays and anchor dots.

## ClinicalMap source

```javascript
class ClinicalMap {
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

  _dockCard(mod) {
    return `<div class="dock-card idle" id="dock-${mod.key}" style="--mod-color:${mod.color || 'var(--brand-teal)'};">
      <div class="dock-head"><span class="dock-icon">${mod.icon}</span><span class="dock-name">${mod.name}</span><span class="dock-pill idle" id="dock-${mod.key}-pill">Idle</span></div>
      <div class="dock-status" id="dock-${mod.key}-status"></div>
      <div class="dock-body" id="dock-${mod.key}-body">${specBlockHTML(mod.key)}</div>
    </div>`;
  }

  setState(key, state, opts = {}) {
    const card = this.container.querySelector(`#dock-${key}`);
    const anchor = this.container.querySelector(`#anchor-${key}`);
    if (!card) return;
    card.classList.remove('idle', 'active', 'done', 'fail');
    card.classList.add(state);
    if (anchor) { anchor.classList.remove('idle', 'active', 'done', 'fail'); anchor.classList.add(state); }
    this.setScanning(key, state === 'active');
  }

  setScanning(key, active) {
    const overlays = ['#scan-sweep', '#radar-sweep', '#scan-glints'].map(sel => this.container.querySelector(sel)).filter(Boolean);
    const color = SCAN_COLORS[key] || '23,144,138';
    overlays.forEach(el => { el.style.setProperty('--scan-color', color); el.classList.toggle('active', active); });
  }
}
```

