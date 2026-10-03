import { describe, it, expect, afterEach } from 'vitest';
import { lockBodyScroll, unlockBodyScroll, wireEditForm } from '../src/ui/formPopup.js';

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
});
