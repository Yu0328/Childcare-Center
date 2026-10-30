// Press a photo and drag it onto another photo's place to swap the two. A mouse drags as soon as it
// moves; a finger has to hold still for HOLD_MS first, so an ordinary swipe still scrolls the page.
// Pointer events, not HTML drag-and-drop: the upload slots already use that for files dropped in
// from the computer, and phones don't do HTML drag-and-drop at all.
const HOLD_MS = 350;
const MOVE_PX = 6;

export function wirePhotoDragSwap(root, { itemSelector, canDrag = () => true, onSwap }) {
  const itemAt = (x, y) => {
    const element = document.elementFromPoint(x, y);
    const item = element && element.closest(itemSelector);
    return item && root.contains(item) ? item : null;
  };

  root.addEventListener('pointerdown', event => {
    const item = event.target.closest(itemSelector);
    if (event.button !== 0 || !item || !root.contains(item)) return;
    if (event.target.closest('button') || !canDrag(item)) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const isMouse = event.pointerType === 'mouse';
    let held = isMouse;
    let dragging = false;
    let target = null;
    const holdTimer = isMouse ? null : setTimeout(() => {
      held = true;
      begin();
    }, HOLD_MS);

    function begin() {
      dragging = true;
      item.classList.add('photo-drag--source');
    }

    function setTarget(next) {
      if (next === target) return;
      if (target) target.classList.remove('photo-drag--target');
      target = next;
      if (target) target.classList.add('photo-drag--target');
    }

    function onMove(moveEvent) {
      if (!dragging) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= MOVE_PX) return;
        // A finger that moves before the hold is up is scrolling the page, not dragging.
        if (!held) return finish();
        begin();
      }
      moveEvent.preventDefault();
      const over = itemAt(moveEvent.clientX, moveEvent.clientY);
      setTarget(over && over !== item ? over : null);
    }

    // Once a held photo is being dragged, the page must not scroll under the finger.
    function onTouchMove(touchEvent) {
      if (dragging) touchEvent.preventDefault();
    }

    function onUp() {
      const wasDragging = dragging;
      const dropTarget = target;
      finish();
      if (!wasDragging) return;
      // A photo slot is a <label> around a file input: the click that ends a drag would open the
      // file picker. Swallow that one click only (gone by the next task if no click comes).
      const swallow = clickEvent => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      };
      root.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0);
      if (dropTarget) onSwap(item, dropTarget);
    }

    function finish() {
      clearTimeout(holdTimer);
      item.classList.remove('photo-drag--source');
      setTarget(null);
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', finish);
      document.removeEventListener('touchmove', onTouchMove);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', finish);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  });

  // A long press on a photo would otherwise bring up the phone's 儲存圖片 menu.
  root.addEventListener('contextmenu', event => {
    if (event.target.closest(itemSelector)) event.preventDefault();
  });
}
