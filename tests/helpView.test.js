import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHelpView } from '../src/ui/helpView.js';
import { HELP_CHAPTERS } from '../src/ui/helpContent.js';

const phone = () => vi.stubGlobal('matchMedia', () => ({ matches: true }));
// jsdom doesn't implement window.scrollTo (it logs an error on every chapter switch).
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('renderHelpView', () => {
  it('desktop: lists every chapter and opens the first', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    const toc = [...container.querySelectorAll('.help-toc [data-chapter]:not([data-section])')];
    expect(toc.map(b => b.textContent.trim())).toEqual(HELP_CHAPTERS.map(c => c.title));
    expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[0].title);
    expect(toc[0].getAttribute('aria-current')).toBe('true');
  });

  it('choosing a chapter shows it', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    container.querySelector(`[data-chapter="${HELP_CHAPTERS[3].id}"]`).click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[3].title));
  });

  it('上一章／下一章 move between chapters, absent at the ends', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    expect(container.querySelector('[data-nav="prev"]')).toBeNull();
    container.querySelector('[data-nav="next"]').click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[1].title));
    container.querySelector('[data-nav="prev"]').click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[0].title));

    const last = HELP_CHAPTERS.at(-1).id;
    await renderHelpView(container, { onBack: () => {}, chapterId: last });
    expect(container.querySelector('[data-nav="next"]')).toBeNull();
  });

  it('desktop ← 返回 calls onBack', async () => {
    const container = document.createElement('div');
    let backed = false;
    await renderHelpView(container, { onBack: () => { backed = true; } });
    container.querySelector('[data-action="back"]').click();
    expect(backed).toBe(true);
  });

  it('phone: TOC first, chapter alone, ← 返回 goes back to the TOC', async () => {
    phone();
    const container = document.createElement('div');
    let backed = false;
    await renderHelpView(container, { onBack: () => { backed = true; } });
    expect(container.querySelector('.help-chapter')).toBeNull();
    container.querySelector(`[data-chapter="${HELP_CHAPTERS[1].id}"]`).click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter')).not.toBeNull());
    expect(container.querySelector('.help-toc')).toBeNull();
    container.querySelector('[data-action="back"]').click();
    await vi.waitFor(() => expect(container.querySelector('.help-toc')).not.toBeNull());
    expect(backed).toBe(false);
  });

  it('keeps the 此功能僅網頁版提供 note only in the offline build', async () => {
    const id = HELP_CHAPTERS.find(c => c.html.includes('help-webonly')).id;
    const offline = document.createElement('div');
    await renderHelpView(offline, { onBack: () => {}, chapterId: id });
    expect(offline.textContent).toContain('此功能僅網頁版提供');
    const hosted = document.createElement('div');
    await renderHelpView(hosted, { onBack: () => {}, chapterId: id, hosted: true });
    expect(hosted.textContent).not.toContain('此功能僅網頁版提供');
  });
});
