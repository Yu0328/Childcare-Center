import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountDemo } from '../src/ui/helpDemo.js';

const DEMO = {
  id: 'demo',
  title: '示範',
  lead: '說明',
  note: '提醒',
  steps: [
    { cap: { desk: '電腦第一步', phone: '手機第一步' }, draw: m => `<div class="ms" data-frame="1">${m}<span data-hit>按</span></div>` },
    { cap: '第二步', draw: () => '<div class="ms" data-frame="2"><span data-hit>按</span></div>' },
    { cap: '第三步', draw: () => '<div class="ms" data-frame="3"></div>' },
  ],
};

afterEach(() => vi.useRealTimers());

describe('mountDemo', () => {
  it('lists one caption per step for the mode and shows the first frame', () => {
    const el = document.createElement('article');
    mountDemo(el, DEMO, { mode: 'phone' });
    expect([...el.querySelectorAll('.help-demo__steps button')].map(b => b.textContent.replace(/^\d+/, ''))).toEqual([
      '手機第一步',
      '第二步',
      '第三步',
    ]);
    expect(el.querySelector('[data-frame]').dataset.frame).toBe('1');
    expect(el.querySelector('[data-frame]').textContent).toContain('phone');
    expect(el.querySelector('.help-demo__note').textContent).toBe('提醒');
  });

  it('jumps to a step from its dot', () => {
    const el = document.createElement('article');
    mountDemo(el, DEMO, { mode: 'desk' });
    el.querySelector('.help-demo__dot[data-go="2"]').click();
    expect([...el.querySelectorAll('.help-dev__screen [data-frame]')].at(-1).dataset.frame).toBe('3');
    expect(el.querySelector('.help-demo__steps [data-go="2"]').getAttribute('aria-current')).toBe('step');
    expect(el.querySelector('.help-demo__steps [data-go="0"]').hasAttribute('aria-current')).toBe(false);
  });

  it('toggles 暫停／播放', () => {
    const el = document.createElement('article');
    mountDemo(el, DEMO, { mode: 'desk' });
    const play = el.querySelector('.help-demo__play');
    expect(play.textContent).toContain('暫停');
    play.click();
    expect(play.textContent).toContain('播放');
  });

  it('starts paused when motion is reduced', () => {
    const el = document.createElement('article');
    mountDemo(el, DEMO, { mode: 'desk', reduced: true });
    expect(el.querySelector('.help-demo__play').textContent).toContain('播放');
  });

  it('after destroy, re-mounting on the same element leaves only the new demo answering clicks', () => {
    const el = document.createElement('article');
    document.body.append(el);
    const draw = vi.fn(() => '<div class="ms"><span data-hit>按</span></div>');
    const demo = { ...DEMO, steps: DEMO.steps.map(step => ({ ...step, draw })) };
    mountDemo(el, demo, { mode: 'phone' }).destroy();
    mountDemo(el, demo, { mode: 'desk' });
    draw.mockClear();
    el.querySelector('.help-demo__dot[data-go="2"]').click();
    expect(draw).toHaveBeenCalledTimes(1); // a stale listener from the phone mount would draw again
    el.remove();
  });

  it('destroy leaves nothing running', () => {
    vi.useFakeTimers();
    const el = document.createElement('article');
    const demo = mountDemo(el, DEMO, { mode: 'desk' });
    demo.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
