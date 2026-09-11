// On mobile, the 8 "list above / add-form below" screens wrap their add-form in a <dialog> that
// stays closed until a fixed "+" button opens it, instead of always showing the form inline —
// see docs/superpowers/specs/2026-09-11-mobile-add-form-popup-design.md. Desktop keeps the form
// always open (no backdrop, no FAB), identical to today's layout.
const MOBILE_QUERY = '(max-width: 640px)';
export const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches;

export function formPopupMarkup({ formHtml, fabLabel }) {
  const mobile = isMobile();
  return `
    <dialog class="form-popup" ${mobile ? '' : 'open'}>
      <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
      ${formHtml}
    </dialog>
    ${mobile ? `<button type="button" class="fab" data-action="open-form-popup" aria-label="${fabLabel}">＋</button>` : ''}
  `;
}

export function wireFormPopup(container) {
  const dialog = container.querySelector('.form-popup');
  container.querySelector('[data-action="open-form-popup"]')?.addEventListener('click', () => dialog.showModal());
  container.querySelector('[data-action="close-form-popup"]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

// For per-item nested add-forms — one trigger button per row rather than a single list-level FAB
// (e.g. formEditorView's per-indicator "＋ 新增觀察紀錄", courseplanTabView's per-entry
// "＋ 新增實施紀錄"). On mobile the caller wraps its entry-form in `<dialog class="form-popup">`
// (see nestedEntryFormDialog below); desktop leaves the entry-form as a plain element with no
// dialog wrapper, so this falls back to today's inline hidden-toggle there — same "closing
// mid-edit doesn't clear input" property as wireFormPopup, decided per-trigger by whether its
// entry-form actually got wrapped in a dialog at render time.
export function wireNestedEntryForm(trigger, entryForm) {
  const dialog = entryForm.closest('dialog.form-popup');
  if (!dialog) {
    entryForm.hidden = true;
    trigger.addEventListener('click', () => {
      entryForm.hidden = !entryForm.hidden;
    });
    return;
  }
  trigger.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('[data-action="close-form-popup"]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

// Wraps a nested entry-form's markup in the same `<dialog class="form-popup">` chrome as
// formPopupMarkup, without a FAB (the caller already has its own trigger button). Mobile only —
// desktop passes `entryFormHtml` straight through unchanged.
export function nestedEntryFormDialog(entryFormHtml) {
  if (!isMobile()) return entryFormHtml;
  return `
    <dialog class="form-popup">
      <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
      ${entryFormHtml}
    </dialog>
  `;
}
