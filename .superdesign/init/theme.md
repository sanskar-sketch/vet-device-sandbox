# Vitarus theme

## Compact token summary

- Brand navy: `#0c3552`; brand teal: `#15958d`.
- Base: `#f5f8f7`; surface: `#ffffff`; secondary surface: `#eef4f3`; border: `#d8e5e2`.
- Text: `#12324a`; muted: `#637784`; dim: `#8798a1`.
- Module accents: thermal `#c9484d`, ultrasound `#e6a23c`, cardiac `#be3245`, blood `#75417d`, gait `#3d76b0`, structural `#15958d`.
- Font: system sans stack; mono: Fira Code / Cascadia Code / Consolas.
- Radius: 14px cards, 9px controls; shadows are restrained navy-tinted soft shadows.
- Layout: centered max-width role portals, responsive two-column intake, clinical map with sticky patient panel on desktop.
- Motion: scan sweep, radar wedge, glints, lock-on ring, grid shimmer, active card scan line, status beacon, completion settle; honor `prefers-reduced-motion`.

## Source tokens

```css
:root {
  --bg: #f5f8f7; --surface: #ffffff; --surface-2: #eef4f3; --border: #d8e5e2;
  --accent: #15958d; --accent-hover: #0f766f; --blue: #17577b; --blue-light: #267ca2;
  --orange: #e6a23c; --red: #c9484d; --text: #12324a; --text-muted: #637784; --text-dim: #8798a1;
  --brand-navy: #0c3552; --brand-teal: #15958d; --radius: 14px; --radius-sm: 9px;
}
```

Source files: `css/redesign.css`, `css/shared.css`, `css/app.css`, `css/report.css`.

