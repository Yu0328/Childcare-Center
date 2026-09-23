// Tapping anywhere on an entry opens its edit form, so the screen doesn't need a visible 編輯
// button on every row. Each tappable area is marked data-click-edit and its own edit button
// data-row-edit (kept in the DOM, visually hidden until keyboard-focused — see styles.css). The
// innermost area wins, so a 實施紀錄 row inside a 課程計畫 card edits the row, not the card.
const IGNORE = 'button, a, input, select, textarea, label, summary, dialog, .entry-form';
const wired = new WeakSet();

// Views re-render by replacing innerHTML inside the same container, so wire each container only once
// — a second listener would toggle the form open and straight back shut.
export function wireRowClickEdit(container) {
  if (wired.has(container)) return;
  wired.add(container);
  container.addEventListener('click', event => {
    if (event.target.closest(IGNORE)) return;
    // Dragging to select/copy a long narrative shouldn't also toggle its edit form.
    if (String(window.getSelection?.() ?? '')) return;
    const area = event.target.closest('[data-click-edit]');
    if (!area || !container.contains(area)) return;
    const button = [...area.querySelectorAll('[data-row-edit]')].find(b => b.closest('[data-click-edit]') === area);
    button?.click();
  });
}
