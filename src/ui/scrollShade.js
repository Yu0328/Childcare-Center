// Toggles has-overflow-top / has-overflow-bottom on a scroll container so CSS can show a soft
// edge shade ONLY when there's actually clipped content in that direction (see .card-list--rows
// in styles.css). No-op when the list fits without scrolling.
export function wireScrollShade(el) {
  if (!el) return;
  const update = () => {
    const overflow = el.scrollHeight - el.clientHeight;
    const scrollable = overflow > 1;
    el.classList.toggle('is-scrollable', scrollable);
    el.classList.toggle('has-overflow-top', scrollable && el.scrollTop > 1);
    el.classList.toggle('has-overflow-bottom', scrollable && el.scrollTop < overflow - 1);
  };
  let scrollingTimer;
  const onScroll = () => {
    update();
    el.classList.add('is-scrolling');
    clearTimeout(scrollingTimer);
    scrollingTimer = setTimeout(() => el.classList.remove('is-scrolling'), 700);
  };
  update();
  el.addEventListener('scroll', onScroll, { passive: true });
  // Re-check when the container resizes (e.g. viewport height change shrinks its max-height cap).
  // The observer is cleaned up automatically once `el` is dropped on the next re-render.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(el);
}
