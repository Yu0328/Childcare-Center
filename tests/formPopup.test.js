import { describe, it, expect, afterEach } from 'vitest';
import { lockBodyScroll, unlockBodyScroll, wireEditForm, closeOnBackdropClick } from '../src/ui/formPopup.js';

describe('closeOnBackdropClick', () => {
  function setup() {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = '<select data-field><option>1</option><option>2</option></select>';
    document.body.appendChild(dialog);
    let closed = 0;
    dialog.close = () => { closed += 1; };
    closeOnBackdropClick(dialog);
    const press = (downOn, clickOn) => {
      downOn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      clickOn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    return { dialog, select: dialog.querySelector('[data-field]'), press, closed: () => closed };
  }

  it('closes when the press starts and ends on the backdrop', () => {
    const { dialog, press, closed } = setup();
    press(dialog, dialog);
    expect(closed()).toBe(1);
  });

  // Picking from a phone's native <select> list: the press starts on the field and is released
  // over the backdrop, so the click is reported on the dialog itself.
  it('stays open when the press started on a field inside the popup', () => {
    const { dialog, select, press, closed } = setup();
    press(select, dialog);
    expect(closed()).toBe(0);
  });

  // Some phones don't report the press on the backdrop itself — a backdrop tap must still close.
  it('closes on a backdrop click even when no press was reported before it', () => {
    const { dialog, closed } = setup();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closed()).toBe(1);
  });
});

describe('lockBodyScroll / unlockBodyScroll', () => {
  afterEach(() => {
    unlockBodyScroll();
  });

  it('pins the body at the current scroll offset and restores it on unlock', () => {
    Object.defineProperty(window, 'scrollY', { value: 320, configurable: true });
    let scrolledTo = null;
    window.scrollTo = (x, y) => {
      scrolledTo = y;
    };

    lockBodyScroll();
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-320px');
    expect(document.body.style.overflow).toBe('hidden');

    unlockBodyScroll();
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(scrolledTo).toBe(320);
  });
});

describe('wireEditForm', () => {
  function setup() {
    const card = document.createElement('div');
    card.innerHTML = `
      <button type="button" data-edit>編輯</button>
      <div class="entry-form" data-form hidden>
        <input data-field value="原本">
        <button type="button" data-cancel>取消</button>
      </div>`;
    document.body.appendChild(card);
    return { card, trigger: card.querySelector('[data-edit]'), form: card.querySelector('[data-form]'), cancel: card.querySelector('[data-cancel]') };
  }

  afterEach(() => {
    delete globalThis.matchMedia;
    document.body.innerHTML = '';
  });

  it('手機：點編輯時跳出編輯面板（不是在原地往下展開），按取消關掉', () => {
    globalThis.matchMedia = () => ({ matches: true });
    const opened = [];
    const closed = [];
    HTMLDialogElement.prototype.showModal = function () { opened.push(this); this.open = true; };
    HTMLDialogElement.prototype.close = function () { closed.push(this); this.open = false; this.dispatchEvent(new Event('close')); };
    const { card, trigger, form, cancel } = setup();

    wireEditForm(trigger, form, cancel);
    const dialog = form.closest('dialog.form-popup');
    expect(dialog).not.toBeNull();
    expect(card.contains(dialog)).toBe(true); // still inside the card, so existing lookups find its fields
    expect(form.hidden).toBe(false);

    trigger.click();
    expect(opened).toEqual([dialog]);
    cancel.click();
    expect(closed).toEqual([dialog]);
  });

  it('電腦：維持在原地展開／收合', () => {
    const { trigger, form, cancel } = setup();

    wireEditForm(trigger, form, cancel);
    expect(form.closest('dialog')).toBeNull();
    trigger.click();
    expect(form.hidden).toBe(false);
    cancel.click();
    expect(form.hidden).toBe(true);
  });

  // Otherwise a cancelled edit lingers out of sight and later trips the 「還有沒儲存的內容」 prompt.
  it('按取消會把改過的內容還原', () => {
    const { trigger, form, cancel } = setup();
    wireEditForm(trigger, form, cancel);
    trigger.click();
    form.querySelector('[data-field]').value = '改到一半';
    cancel.click();
    expect(form.querySelector('[data-field]').value).toBe('原本');
  });
});
