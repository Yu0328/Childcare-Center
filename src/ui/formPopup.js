// On mobile, the 8 "list above / add-form below" screens wrap their add-form in a <dialog> that
// stays closed until a fixed "+" button opens it, instead of always showing the form inline —
// see docs/superpowers/specs/2026-09-11-mobile-add-form-popup-design.md. Desktop keeps the form
// always open (no backdrop, no FAB), identical to today's layout.
const MOBILE_QUERY = '(max-width: 640px)';
export const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches;

// showModal() alone doesn't stop the page behind the popup from scrolling on touch devices —
// locking body scroll while a popup is open keeps the backdrop from feeling like it's just
// floating over a page the user can still drag around underneath it.
export const lockBodyScroll = () => {
  document.body.style.overflow = 'hidden';
};
export const unlockBodyScroll = () => {
  document.body.style.overflow = '';
};

// Shared by every "+" trigger (the list-level FABs below and monthlyPlanEditorView's day-cell
// one) so all of them render identically — a vector plus scales crisply at any button size,
// unlike a text "＋" glyph whose weight/centering drifts across fonts.
export const fabIconHtml = () => `
  <svg class="fab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14"/>
  </svg>
`;

export function formPopupMarkup({ formHtml, fabLabel }) {
  const mobile = isMobile();
  return `
    <dialog class="form-popup" ${mobile ? '' : 'open'}>
      <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
      ${formHtml}
    </dialog>
    ${mobile ? `<button type="button" class="fab" data-action="open-form-popup" aria-label="${fabLabel}">${fabIconHtml()}</button>` : ''}
  `;
}

export function wireFormPopup(container) {
  const dialog = container.querySelector('.form-popup');
  // A fresh render's dialog always starts closed, even if the previous one was open when it got
  // replaced (e.g. a successful submit re-renders the whole container instead of closing the
  // dialog first) — clear any lock left over from that so scrolling doesn't stay stuck off.
  unlockBodyScroll();
  container.querySelector('[data-action="open-form-popup"]')?.addEventListener('click', () => {
    dialog.showModal();
    lockBodyScroll();
  });
  container.querySelector('[data-action="close-form-popup"]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  // Covers every way the dialog can close — the button above, backdrop click, and the Escape key.
  dialog.addEventListener('close', unlockBodyScroll);
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
  unlockBodyScroll(); // see wireFormPopup above — a fresh render's dialog always starts closed
  trigger.addEventListener('click', () => {
    dialog.showModal();
    lockBodyScroll();
  });
  dialog.querySelector('[data-action="close-form-popup"]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', unlockBodyScroll);
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
