# Vitarus layouts

The app uses page-specific static shells rather than a framework layout.

## Public landing shell — `index.html`

`landing-header` contains the logo and wordmark. `landing-hero` contains the logo mark, headline, explanatory copy, two authentication CTAs, and six diagnostic modality tags.

## Authenticated app shell — `staff/index.html`, `vet/index.html`, `owner/index.html`, `admin/index.html`

```html
<div class="app-header">
  <div class="app-brand">
    <img class="logo" src="../assets/brand/logo-icon-64.png" alt="Vitarus">
    <div><div>Vitarus</div><div class="sub">[Role] Portal</div></div>
  </div>
  <div class="stepper" id="stepper"></div>
  <div id="auth-strip-mount"></div>
</div>
<div class="wizard-body">[role-specific content]</div>
```

`staff` adds a four-step stepper for intake, hardware detection, exam capture, and fusion report. `vet`, `owner`, and `admin` use a centered `.wizard-body` and tabbed or list-based content.

## Legacy device shell — `devices/*.html`

```html
<header class="page-header">
  <a href="../index.html" class="back-link">← All Devices</a>
  <h1>[device name]</h1>
  <span class="device-badge">[protocol]</span>
</header>
<div class="sandbox-layout"><aside class="sidebar">...</aside><main class="main-panel">...</main></div>
```

