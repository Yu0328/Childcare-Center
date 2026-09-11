// On mobile, the 8 "list above / add-form below" screens wrap their add-form in a <dialog> that
// stays closed until a fixed "+" button opens it, instead of always showing the form inline —
// see docs/superpowers/specs/2026-09-11-mobile-add-form-popup-design.md. Desktop keeps the form
// always open (no backdrop, no FAB), identical to today's layout.
const MOBILE_QUERY = '(max-width: 640px)';
const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches;

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
