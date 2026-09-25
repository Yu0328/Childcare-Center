// On mobile, the 8 "list above / add-form below" screens wrap their add-form in a <dialog> that
// stays closed until a fixed "+" button opens it, instead of always showing the form inline —
// see docs/superpowers/specs/2026-09-11-mobile-add-form-popup-design.md. Desktop keeps the form
// always open (no backdrop, no FAB), identical to today's layout.
const MOBILE_QUERY = '(max-width: 640px)';
export const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches;

// showModal() alone doesn't stop the page behind the popup from scrolling on touch devices —
// locking body scroll while a popup is open keeps the backdrop from feeling like it's just
// floating over a page the user can still drag around underneath it.
//
// `overflow: hidden` alone isn't enough on iOS Safari: it stops the body's own scrollbar but not
// the rubber-band bounce/drag gesture, which moves the whole visual viewport (dragging the
// popup's `position: fixed` box along with it) rather than anything CSS `overflow` governs — this
// is the "面板可以跟著頁面上下滑動" bug, most obvious once the page is pinch-zoomed in and there's
// more empty space to drag through. Pinning the body itself at its current scroll offset via
// `position: fixed` takes it out of the document flow entirely so there's nothing left to
// rubber-band, without touching pinch-zoom itself.
let scrollYBeforeLock = 0;
export const lockBodyScroll = () => {
  scrollYBeforeLock = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollYBeforeLock}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
};
export const unlockBodyScroll = () => {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  window.scrollTo(0, scrollYBeforeLock);
};

// Shared by every "+" trigger (the list-level FABs below and monthlyPlanEditorView's day-cell
// one) so all of them render identically — a vector plus scales crisply at any button size,
// unlike a text "＋" glyph whose weight/centering drifts across fonts.
export const fabIconHtml = () => `
  <svg class="fab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14"/>
  </svg>
`;

const FAB_POS_KEY = 'c-form-fab-pos';
const FAB_DRAG_THRESHOLD = 6; // px of pointer movement before a press-and-hold counts as a drag, not a tap

function clampFabPosition(fab, left, top) {
  const margin = 4;
  // offsetWidth/Height read 0 while the FAB is [hidden] (monthlyPlanEditorView's day-cell one
  // starts that way) — fall back to its actual rendered size so a saved position isn't clamped
  // as if the button were a single point.
  const width = fab.offsetWidth || 64;
  const height = fab.offsetHeight || 64;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}

function applyFabPosition(fab, left, top) {
  fab.style.left = `${left}px`;
  fab.style.top = `${top}px`;
  fab.style.right = 'auto';
  fab.style.bottom = 'auto';
}

// Lets the user press-and-hold the "+" FAB and drag it wherever's most comfortable to reach
// one-handed, instead of it being stuck at a fixed spot. Saved as a fraction of the viewport
// (not raw px) so the same spot still makes sense after a device rotation or on a different
// screen size, and shared by every FAB via one localStorage key so dragging it once on any
// screen carries over to the rest.
export function wireFabDrag(fab) {
  const saved = localStorage.getItem(FAB_POS_KEY);
  if (saved) {
    try {
      const { xFrac, yFrac } = JSON.parse(saved);
      const { left, top } = clampFabPosition(fab, xFrac * window.innerWidth, yFrac * window.innerHeight);
      applyFabPosition(fab, left, top);
    } catch {
      // malformed/legacy saved value — keep the CSS default position
    }
  }

  let pointerId = null;
  let dragging = false;
  let justDragged = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  fab.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    dragging = false;
    startX = event.clientX;
    startY = event.clientY;
    const rect = fab.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
  });

  fab.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging) {
      if (Math.hypot(dx, dy) < FAB_DRAG_THRESHOLD) return;
      dragging = true;
      fab.setPointerCapture(pointerId);
    }
    const { left, top } = clampFabPosition(fab, originLeft + dx, originTop + dy);
    applyFabPosition(fab, left, top);
  });

  fab.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    if (dragging) {
      justDragged = true;
      const rect = fab.getBoundingClientRect();
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({
        xFrac: rect.left / window.innerWidth,
        yFrac: rect.top / window.innerHeight,
      }));
    }
    pointerId = null;
    dragging = false;
  });

  // A drag ends with the same pointerup a tap would send, and the browser fires a click right
  // after it regardless — swallow that one click so releasing a drag doesn't also open the popup.
  // Registered before the open-popup click listener below so it always runs first.
  fab.addEventListener('click', event => {
    if (justDragged) {
      justDragged = false;
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });
}

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
  const fab = container.querySelector('[data-action="open-form-popup"]');
  if (fab) {
    wireFabDrag(fab);
    fab.addEventListener('click', () => {
      dialog.showModal();
      lockBodyScroll();
    });
  }
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
// formPopupMarkup, without a FAB (the caller already has its own trigger button). Mobile only by
// default — desktop passes `entryFormHtml` straight through unchanged. `wrap` lets a caller that
// needs a popup at wider widths too (monthlyPlanEditorView on mid-size screens) force it.
export function nestedEntryFormDialog(entryFormHtml, wrap = isMobile()) {
  if (!wrap) return entryFormHtml;
  return `
    <dialog class="form-popup">
      <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
      ${entryFormHtml}
    </dialog>
  `;
}
