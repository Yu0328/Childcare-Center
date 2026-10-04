import { describe, it, expect } from 'vitest';
import { hasUnsavedInput, captureDrafts, restoreDrafts } from '../src/ui/unsavedInput.js';

function view() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="entry-form" data-entry-form-for="A">
      <input type="date" data-entry-field="date" data-indicator-code="A" value="2026-06-01">
      <label><input type="radio" name="s-A" data-entry-field="status" data-indicator-code="A" value="developed" checked></label>
      <label><input type="radio" name="s-A" data-entry-field="status" data-indicator-code="A" value="developing"></label>
      <textarea data-entry-field="note" data-indicator-code="A"></textarea>
    </div>
    <div class="entry-form" data-entry-form-for="B" hidden>
      <textarea data-entry-field="note" data-indicator-code="B"></textarea>
    </div>
    <select data-field="domain"><option value="1">一</option><option value="2">二</option></select>`;
  return root;
}

describe('hasUnsavedInput', () => {
  it('剛畫好的畫面（含預先填好的日期）不算有未儲存內容', () => {
    expect(hasUnsavedInput(view())).toBe(false);
  });

  // A one-line field drops an imported 說明's line breaks the moment it's drawn — that's not typing.
  it('單行欄位自動拿掉換行、日期格式不對被清空，都不算有未儲存內容', () => {
    const root = document.createElement('div');
    const note = document.createElement('input');
    note.type = 'text';
    note.setAttribute('value', '第一行\n第二行');
    const date = document.createElement('input');
    date.type = 'date';
    date.setAttribute('value', '115.06.01');
    root.append(note, date);
    expect(hasUnsavedInput(root)).toBe(false);
    note.value = '改過';
    expect(hasUnsavedInput(root)).toBe(true);
  });

  it('打了字、改了選項、換了選單都算', () => {
    const typed = view();
    typed.querySelector('[data-indicator-code="B"]').value = '寫到一半';
    expect(hasUnsavedInput(typed)).toBe(true);

    const radio = view();
    radio.querySelector('[value="developing"]').checked = true;
    expect(hasUnsavedInput(radio)).toBe(true);

    const select = view();
    select.querySelector('[data-field="domain"]').value = '2';
    expect(hasUnsavedInput(select)).toBe(true);
  });

});

describe('captureDrafts / restoreDrafts', () => {
  it('存了 A 之後畫面重畫，B 打到一半的內容放回去並保持打開；A 剛存的內容不放回去', () => {
    const root = view();
    root.querySelector('[data-entry-form-for="B"]').hidden = false;
    root.querySelector('textarea[data-indicator-code="B"]').value = 'B 打到一半';
    root.querySelector('textarea[data-indicator-code="A"]').value = 'A 剛存的';
    root.querySelector('[data-indicator-code="A"][value="developing"]').checked = true;

    const drafts = captureDrafts(root, root.querySelector('[data-entry-form-for="A"]'));
    const redrawn = view();
    restoreDrafts(redrawn, drafts);

    expect(redrawn.querySelector('textarea[data-indicator-code="B"]').value).toBe('B 打到一半');
    expect(redrawn.querySelector('[data-entry-form-for="B"]').hidden).toBe(false);
    expect(redrawn.querySelector('textarea[data-indicator-code="A"]').value).toBe('');
    expect(redrawn.querySelector('[data-indicator-code="A"][value="developed"]').checked).toBe(true);
  });
});
