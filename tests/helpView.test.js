import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHelpView } from '../src/ui/helpView.js';
import { HELP_CHAPTERS } from '../src/ui/helpContent.js';

const phone = () => vi.stubGlobal('matchMedia', query => ({ matches: query.includes('max-width') }));
const heads = container => [...container.querySelectorAll('.help-ch__head')];
const allDemos = HELP_CHAPTERS.flatMap(chapter => chapter.demos || []);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('renderHelpView', () => {
  it('shows every chapter, only the first one open', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    expect(heads(container).map(h => h.querySelector('.help-ch__title').firstChild.textContent)).toEqual(
      HELP_CHAPTERS.map(c => c.title)
    );
    expect(heads(container).map(h => h.getAttribute('aria-expanded'))).toEqual(
      HELP_CHAPTERS.map((_, i) => String(i === 0))
    );
  });

  it('opens and closes a chapter from its header, leaving the others alone', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    const [first, second] = heads(container);
    second.click();
    expect(second.getAttribute('aria-expanded')).toBe('true');
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector(`#${second.getAttribute('aria-controls')}`).inert).toBe(false);
    second.click();
    expect(second.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector(`#${second.getAttribute('aria-controls')}`).inert).toBe(true);
  });

  it('defaults to 電腦版 on a computer and 手機版 on a phone', async () => {
    const desk = document.createElement('div');
    await renderHelpView(desk, { onBack: () => {} });
    expect(desk.querySelector('.help-view').dataset.mode).toBe('desk');

    phone();
    const onPhone = document.createElement('div');
    await renderHelpView(onPhone, { onBack: () => {} });
    expect(onPhone.querySelector('.help-view').dataset.mode).toBe('phone');
  });

  it('the 手機版／電腦版 switch redraws the demos and is remembered', async () => {
    // A demo whose steps are the same in both modes, so step numbers line up.
    const demo = allDemos.find(
      d => !d.modes && d.steps.every(s => !s.modes) && d.steps.some(s => typeof s.cap !== 'string' && s.cap.desk !== s.cap.phone)
    );
    const step = demo.steps.findIndex(s => typeof s.cap !== 'string' && s.cap.desk !== s.cap.phone);
    const captionOf = container =>
      container.querySelector(`.help-demo[data-demo="${demo.id}"] .help-demo__steps [data-go="${step}"]`).textContent;

    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    expect(captionOf(container)).toContain(demo.steps[step].cap.desk);
    container.querySelector('.help-seg [data-mode="phone"]').click();
    expect(container.querySelector('.help-view').dataset.mode).toBe('phone');
    expect(container.querySelector('.help-seg [data-mode="phone"]').getAttribute('aria-checked')).toBe('true');
    expect(captionOf(container)).toContain(demo.steps[step].cap.phone);

    const again = document.createElement('div');
    await renderHelpView(again, { onBack: () => {} });
    expect(again.querySelector('.help-view').dataset.mode).toBe('phone');
  });

  it('hides a demo meant for the other kind of device', async () => {
    const phoneOnly = allDemos.find(d => d.modes && d.modes.length === 1 && d.modes[0] === 'phone');
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    expect(container.querySelector(`.help-demo[data-demo="${phoneOnly.id}"]`).hidden).toBe(true);
    container.querySelector('.help-seg [data-mode="phone"]').click();
    expect(container.querySelector(`.help-demo[data-demo="${phoneOnly.id}"]`).hidden).toBe(false);
  });

  it('← 返回首頁 calls onBack', async () => {
    const container = document.createElement('div');
    let backed = false;
    await renderHelpView(container, { onBack: () => { backed = true; } });
    container.querySelector('[data-action="back"]').click();
    expect(backed).toBe(true);
  });

  it('keeps the 此功能僅網頁版提供 note only in the offline build', async () => {
    const offline = document.createElement('div');
    await renderHelpView(offline, { onBack: () => {} });
    expect(offline.textContent).toContain('此功能僅網頁版提供');
    const hosted = document.createElement('div');
    await renderHelpView(hosted, { onBack: () => {}, hosted: true });
    expect(hosted.textContent).not.toContain('此功能僅網頁版提供');
  });
});
