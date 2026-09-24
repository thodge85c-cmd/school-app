/**
 * ui.js – tiny helpers for building the screen.
 *
 * There's no framework here, so we make DOM elements by hand. The h()
 * function keeps that readable:
 *
 *   h('button', { class: 'btn', onclick: save }, 'Save')
 *
 * creates <button class="btn">Save</button> with a click handler attached.
 * The other helpers show bottom sheets (the panels that slide up from the
 * bottom of the screen), confirm boxes and toast messages.
 */

/** Create an element. attrs can include class, text, on<event> handlers, dataset, value. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val == null || val === false) continue;
    if (key === 'class') el.className = val;
    else if (key === 'text') el.textContent = val;
    else if (key === 'value') value = val;                     // applied after children (needed for <select>)
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (typeof val === 'boolean') el[key] = val;           // checked, disabled, selected, hidden …
    else el.setAttribute(key, val);
  }
  append(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

/** Append children (strings, elements, arrays, or null which is skipped). */
export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Remove everything inside an element. */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** A unique id for new courses, tasks, etc. */
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// --- Bottom sheet ----------------------------------------------------------

let currentSheet = null;

/**
 * Show a panel that slides up from the bottom. Returns { body, close }.
 * Only one sheet is open at a time; opening another replaces it.
 */
export function openSheet(title, content, { onClose } = {}) {
  closeSheet();
  const body = h('div', { class: 'sheet-body' }, content);
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-handle' }),
    h('div', { class: 'sheet-header' },
      h('h2', { text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, '✕')),
    body);
  const backdrop = h('div', { class: 'sheet-backdrop' }, panel);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
  backdrop._onClose = onClose;
  currentSheet = backdrop;
  document.body.append(backdrop);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => backdrop.classList.add('open'));
  return { body, close: closeSheet };
}

export function closeSheet() {
  if (!currentSheet) return;
  const el = currentSheet;
  currentSheet = null;
  el.remove();
  document.body.classList.remove('sheet-open');
  if (typeof el._onClose === 'function') el._onClose();
}

export function isSheetOpen() {
  return currentSheet !== null;
}

// --- Confirm box -----------------------------------------------------------

/** Ask a yes/no question. Resolves true if the user taps the OK button. */
export function confirmDialog(message, { okLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const finish = (answer) => { overlay.remove(); resolve(answer); };
    const overlay = h('div', { class: 'modal-backdrop' },
      h('div', { class: 'modal', role: 'alertdialog' },
        h('p', { text: message }),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, cancelLabel),
          h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onclick: () => finish(true) }, okLabel))));
    document.body.append(overlay);
  });
}

// --- Toast -----------------------------------------------------------------

let toastTimer = null;

/** A short message that pops up at the bottom and fades away. */
export function toast(message, ms = 2500) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// --- Small building blocks used by several tabs ----------------------------

/** A labelled form field: label text on top, the input underneath. */
export function field(labelText, input, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label', text: labelText }),
    input,
    hint ? h('span', { class: 'field-hint', text: hint }) : null);
}

/** A <select> with the given options. options = [[value, label], ...] or ['a','b']. */
export function select(options, value, attrs = {}) {
  const el = h('select', attrs,
    options.map((o) => {
      const [v, label] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, text: label });
    }));
  if (value !== undefined) el.value = value;
  return el;
}

/** The friendly "nothing here yet" message. */
export function emptyState(message) {
  return h('p', { class: 'empty', text: message });
}
