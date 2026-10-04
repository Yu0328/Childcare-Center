// "Typed but not saved yet" = a field whose current value differs from the value the screen was
// drawn with (the HTML's own value/checked/selected, which the browser keeps as the default).
// Every view redraws from saved data after a save, so a clean field means nothing would be lost.
const FIELDS = 'input, textarea, select';

function isDirty(field) {
  if (field.disabled) return false;
  if (field.tagName === 'SELECT') {
    const options = [...field.options];
    // No option marked selected in the HTML means the first one is the default.
    const defaults = options.some(o => o.defaultSelected) ? options.map(o => o.defaultSelected) : options.map((_, i) => i === 0);
    return options.some((o, i) => o.selected !== defaults[i]);
  }
  if (field.type === 'checkbox' || field.type === 'radio') return field.checked !== field.defaultChecked;
  if (field.type === 'file') return field.files?.length > 0;
  if (['button', 'submit', 'reset', 'hidden'].includes(field.type)) return false;
  return field.value !== shownDefault(field);
}

// The drawn value as the field actually shows it. A one-line input drops line breaks (an imported
// 說明 often has some) and a date input blanks a malformed date, so comparing against the raw HTML
// value flagged untouched, already-saved fields as unsaved.
function shownDefault(field) {
  const probe = document.createElement(field.tagName);
  if (field.tagName === 'INPUT') probe.type = field.type;
  probe.value = field.defaultValue;
  return probe.value;
}

export function hasUnsavedInput(root) {
  return [...root.querySelectorAll(FIELDS)].some(isDirty);
}

// 取消 means "throw this away": puts every field back to how it was drawn, so a cancelled edit
// doesn't linger out of sight and later trigger the "還有沒儲存的內容" prompt. Fires `change` on
// each field it touches so dependent bits (e.g. a domain picker's checkbox list) follow along.
export function discardInput(root) {
  for (const field of root.querySelectorAll(FIELDS)) {
    if (!isDirty(field)) continue;
    if (field.tagName === 'SELECT') {
      const options = [...field.options];
      if (options.some(o => o.defaultSelected)) options.forEach(o => { o.selected = o.defaultSelected; });
      else field.selectedIndex = 0;
    } else if (field.type === 'checkbox' || field.type === 'radio') field.checked = field.defaultChecked;
    else field.value = field.type === 'file' ? '' : field.defaultValue;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// Asks before an action that would throw away unsaved typing. True = go ahead.
export function confirmLeaveIfUnsaved(root, confirmFn = message => (typeof confirm === 'function' ? confirm(message) : false)) {
  return !hasUnsavedInput(root) || Boolean(confirmFn('還有沒儲存的內容，確定要離開嗎？離開後這些內容不會保留。'));
}

const quote = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const dataSelector = el =>
  [...el.attributes]
    .filter(attr => attr.name.startsWith('data-'))
    .map(attr => `[${attr.name}=${quote(attr.value)}]`)
    .join('');

// For a view that redraws itself after saving one of several open forms: remembers what was typed
// in the OTHER forms (anything but `exceptForm`, the one just saved) so it can be put back after
// the redraw instead of silently vanishing.
export function captureDrafts(root, exceptForm = null) {
  const drafts = [];
  for (const field of root.querySelectorAll(FIELDS)) {
    if (!isDirty(field) || field.type === 'file') continue;
    const form = field.closest('.entry-form, .panel-form');
    if (!form || form === exceptForm || (exceptForm && exceptForm.contains(form))) continue;
    const fieldSelector = dataSelector(field) + (field.type === 'radio' ? `[value=${quote(field.value)}]` : '');
    if (!fieldSelector) continue;
    drafts.push({ formSelector: dataSelector(form), fieldSelector, value: field.value, checked: field.checked });
  }
  return drafts;
}

export function restoreDrafts(root, drafts) {
  for (const { formSelector, fieldSelector, value, checked } of drafts) {
    const form = formSelector ? root.querySelector(formSelector) : null;
    const field = (form || root).querySelector(fieldSelector);
    if (!field) continue;
    if (field.type === 'checkbox' || field.type === 'radio') field.checked = checked;
    else field.value = value;
    // An inline form that was open stays open (a phone's popup form just keeps the text for when
    // it's opened again).
    if (form && form.hidden && !form.closest('dialog')) form.hidden = false;
  }
}
