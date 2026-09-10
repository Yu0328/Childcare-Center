// Page-header buttons render two labels (full desktop wording + a shorter mobile one) and let
// styles.css's .btn__label-full/.btn__label-short media-query swap between them, rather than
// shrinking font-size — that would leave the desktop wording untouched while still being real
// text, reachable to assistive tech either way.
export function headerButtonLabel(full, short) {
  return `<span class="btn__label-full">${full}</span><span class="btn__label-short">${short}</span>`;
}
