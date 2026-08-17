# Extractable components

## Layout components

### AppHeader
- Source: `staff/index.html`, `vet/index.html`, `owner/index.html`, `admin/index.html`
- Category: layout
- Description: Shared Vitarus logo, role label and authenticated session strip.
- Extractable props: `roleLabel` (string), `showStepper` (boolean), `stepperMarkup` (string)
- Hardcoded: Vitarus logo source, brand treatment, header geometry.

### DeviceHeader
- Source: `devices/*.html`
- Category: layout
- Description: Legacy device console header with back link, device name and protocol badge.
- Extractable props: `deviceName` (string), `deviceBadge` (string)
- Hardcoded: back-link treatment and layout.

## Basic components

### ClinicalMap
- Source: `js/clinical-map.js`
- Category: basic
- Description: Species-aware patient map with instrument dock cards and scan overlays.
- Extractable props: `species`, `breedKey`, `modules`, `activeModule`, `moduleStates`
- Hardcoded: scan layer composition, anchor behavior, clinical map structure.

### Card
- Source: `css/shared.css`
- Category: basic
- Description: Surface container with header/body variants.
- Extractable props: none
- Hardcoded: radius, border, surface, typography.

### Button
- Source: `css/shared.css`
- Category: basic
- Description: Primary, secondary, blue and danger action styles.
- Extractable props: `variant`, `disabled`, `fullWidth`
- Hardcoded: button geometry, type scale and states.

