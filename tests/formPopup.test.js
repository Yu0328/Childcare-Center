import { describe, it, expect, afterEach } from 'vitest';
import { lockBodyScroll, unlockBodyScroll } from '../src/ui/formPopup.js';

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
