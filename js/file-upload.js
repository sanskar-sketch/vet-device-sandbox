/**
 * js/file-upload.js
 *
 * Turns a plain <input type="file"> into a themed picker with a drop zone,
 * the chosen file's name and size, an image thumbnail, and a clear button.
 *
 * The native control is kept in the DOM and stays the source of truth — it's
 * only visually hidden, never `display:none`, so it keeps its place in the
 * tab order, still announces as a file input to screen readers, and every
 * existing `input.files[0]` / `change` listener in the app keeps working
 * untouched. The visible zone is a <label>, so clicking or pressing Enter on
 * it opens the picker with no JS at all; this file adds drag-and-drop and the
 * selected-file readout on top.
 *
 * Usage — no per-call wiring needed, just markup:
 *   <div class="file-drop" data-file-drop>
 *     <input type="file" id="x" accept="image/*">
 *     ... (zone markup, see fileDropMarkup below)
 *   </div>
 * Call FileUpload.init(root) after injecting markup dynamically.
 */
(function () {
  const MAX_LABEL = 34;

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function ellipsize(name) {
    if (name.length <= MAX_LABEL) return name;
    const dot = name.lastIndexOf('.');
    const ext = dot > -1 ? name.slice(dot) : '';
    return name.slice(0, MAX_LABEL - ext.length - 1) + '…' + ext;
  }

  function wire(drop) {
    if (drop.dataset.fileDropReady) return;
    drop.dataset.fileDropReady = '1';

    const input = drop.querySelector('input[type="file"]');
    const zone = drop.querySelector('.file-drop-zone');
    const selected = drop.querySelector('.file-drop-selected');
    const nameEl = drop.querySelector('.file-drop-name');
    const metaEl = drop.querySelector('.file-drop-meta');
    const thumb = drop.querySelector('.file-drop-thumb');
    const clearBtn = drop.querySelector('.file-drop-clear');
    if (!input || !zone || !selected) return;

    let thumbUrl = null;
    function releaseThumb() {
      if (thumbUrl) { URL.revokeObjectURL(thumbUrl); thumbUrl = null; }
    }

    function render() {
      const file = input.files && input.files[0];
      releaseThumb();
      if (!file) {
        selected.hidden = true;
        zone.hidden = false;
        if (thumb) { thumb.hidden = true; thumb.removeAttribute('src'); }
        return;
      }
      zone.hidden = true;
      selected.hidden = false;
      if (nameEl) nameEl.textContent = ellipsize(file.name);
      if (metaEl) metaEl.textContent = humanSize(file.size);
      if (thumb) {
        if (file.type.startsWith('image/')) {
          thumbUrl = URL.createObjectURL(file);
          thumb.src = thumbUrl;
          thumb.hidden = false;
        } else {
          thumb.hidden = true;
          thumb.removeAttribute('src');
        }
      }
    }

    input.addEventListener('change', render);

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        // Existing listeners elsewhere expect a change event when the
        // selection goes away, same as when one is made.
        input.dispatchEvent(new Event('change', { bubbles: true }));
        render();
        input.focus();
      });
    }

    // Drag-and-drop. The dragover handler must preventDefault or the browser
    // navigates to the dropped file instead of handing it over.
    ['dragenter', 'dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'dragleave' && drop.contains(e.relatedTarget)) return;
        drop.classList.remove('is-dragging');
      }));
    drop.addEventListener('drop', e => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      // DataTransfer is the only way to set .files programmatically, and it
      // keeps the input a real file input rather than a JS-held blob.
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Native focus lands on the visually-hidden input; mirror it onto the
    // visible zone so keyboard users can see where they are.
    input.addEventListener('focus', () => drop.classList.add('is-focused'));
    input.addEventListener('blur', () => drop.classList.remove('is-focused'));

    render();
  }

  function init(root) {
    (root || document).querySelectorAll('[data-file-drop]').forEach(wire);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  window.FileUpload = { init };
})();
