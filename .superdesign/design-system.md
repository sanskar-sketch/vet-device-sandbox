# Vitarus design system

Vitarus is a multi-modal veterinary diagnostic platform for clinic staff, vets, pet owners and administrators. Its visual identity comes from a navy dog-and-cat diagnostic logo with a teal medical ring and a six-color instrument arc.

## Direction

Keep the light clinical workspace, navy/teal brand foundation and diagnostic-color system. Add a distinctive editorial-medical graphic language: species silhouettes, diagnostic scan overlays, translucent data rings, subtle grid textures, and modality illustrations. Graphics should support comprehension and trust rather than look like generic AI decoration.

## Tokens

- Navy `#0c3552`, teal `#15958d`, light canvas `#f5f8f7`, white surfaces, pale mint `#eef4f3`.
- Module accents: thermal coral, ultrasound amber, cardiac red, blood plum, gait blue, structural sea green.
- System sans typography; compact mono only for device telemetry.
- 14px card radius, 9px control radius; navy-tinted shadows.
- Motion is purposeful: scan, lock-on, live telemetry, capture completion. All motion must have reduced-motion fallbacks.

## Product graphics

Use the real `assets/brand/logo.png` and `assets/brand/logo-icon.png`. Prefer CSS/vector-native graphics for the live app: diagnostic arcs, waveform lines, paw-print geometry, scan grids, anatomy-inspired silhouettes, heatmap gradients and small data visualizations. Do not use random stock photography. Pet breed images in `assets/breeds/` remain the clinical patient visuals.

## UX priorities

The staff workflow should feel like a calm clinical command center. The scan state should visibly connect the instrument cards to the patient map. Vet review should feel authoritative and legible. Owner reports should feel reassuring and readable. Admin should feel operational and data-dense without reverting to a dark developer console.
