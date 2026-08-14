import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, listChildren, listFormsForChild, listEntriesForForm } from '../src/storage/db.js';
import * as db from '../src/storage/db.js';
import { renderImportPreviewView } from '../src/ui/importPreviewView.js';
import { waitFor } from './helpers.js';

function baseParsed(overrides = {}) {
  return {
    child: { name: '陳小安', birthDate: '2024-11-01' },
    tier: 'Ⅳ',
    period: '115年01月',
    entries: [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走', description: '能獨立穩定行走' },
      { indicatorCode: 'Ⅳ-1-2', date: '2026-01-07', achieved: false, note: '仍在練習', description: '能保持平衡撿拾地上物品' },
    ],
    warnings: [],
    ...overrides,
  };
}

describe('renderImportPreviewView', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('pre-fills the parsed child/tier/period and lists the entries', async () => {
    const container = document.createElement('div');
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel: () => {}, onImported: () => {} });

    expect(container.querySelector('[data-field="name"]').value).toBe('陳小安');
    expect(container.querySelector('[data-field="birthDate"]').value).toBe('2024-11-01');
    expect(container.querySelector('[data-field="tier"]').value).toBe('Ⅳ');
    expect(container.querySelector('[data-field="period-year"]').value).toBe('115');
    expect(container.querySelector('[data-field="period-month"]').value).toBe('1');
    expect(container.textContent).toContain('能獨立穩定行走');
    expect(container.textContent).toContain('可以來回穩定行走');
  });

  it('shows warnings when present', async () => {
    const container = document.createElement('div');
    renderImportPreviewView(container, {
      parsed: baseParsed({ warnings: ['無法從檔案中判斷紀錄年月，日期年份可能不準確，請確認每一筆日期'] }),
      onCancel: () => {},
      onImported: () => {},
    });

    expect(container.textContent).toContain('無法從檔案中判斷紀錄年月');
  });

  it('calls onCancel when cancel is clicked', async () => {
    const container = document.createElement('div');
    const onCancel = vi.fn();
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel, onImported: () => {} });

    container.querySelector('[data-action="cancel"]').click();

    expect(onCancel).toHaveBeenCalled();
  });

  it('creates the child, form, and all entries on confirm', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe('陳小安');

    const forms = await listFormsForChild(children[0].id);
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({ tier: 'Ⅳ', period: '115年01月' });

    const entries = await listEntriesForForm(forms[0].id);
    expect(entries).toHaveLength(2);
  });

  it('excludes unchecked entries from the import', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-entry-include="1"]').checked = false;
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    const forms = await listFormsForChild(children[0].id);
    const entries = await listEntriesForForm(forms[0].id);

    expect(entries).toHaveLength(1);
    expect(entries[0].indicatorCode).toBe('Ⅳ-1-1');
  });

  it('maps each parsed entry\'s achieved flag to a status when saving', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    const forms = await listFormsForChild(children[0].id);
    const entries = await listEntriesForForm(forms[0].id);

    expect(entries.find(e => e.indicatorCode === 'Ⅳ-1-1').status).toBe('developed');
    expect(entries.find(e => e.indicatorCode === 'Ⅳ-1-2').status).toBe('developing');
  });

  it('lets the teacher correct the header fields before confirming', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderImportPreviewView(container, {
      parsed: baseParsed({ child: { name: '錯誤姓名', birthDate: '2024-11-01' } }),
      onCancel: () => {},
      onImported: () => { imported = true; },
    });

    container.querySelector('[data-field="name"]').value = '正確姓名';
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    expect(children[0].name).toBe('正確姓名');
  });

  it('reuses an existing child (matched by name+birthDate) instead of creating a duplicate', async () => {
    const { addChild } = await import('../src/storage/db.js');
    const existing = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    let imported = false;
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(existing.id);
    expect(await listFormsForChild(existing.id)).toHaveLength(1);
  });

  it('splits entries into separate per-tier forms when an entry\'s own indicator tier differs from the document\'s overall tier', async () => {
    const container = document.createElement('div');
    let imported = false;
    const parsed = baseParsed({
      tier: 'Ⅴ',
      entries: [
        { indicatorCode: 'Ⅴ-1-1', date: '2026-01-07', achieved: true, note: 'V的', description: 'x', tier: 'Ⅴ' },
        // Not yet developed into tier Ⅴ, so this observation is genuinely against a Ⅳ indicator.
        { indicatorCode: 'Ⅳ-1-2', date: '2026-01-07', achieved: false, note: '尚未發展', description: 'y', tier: 'Ⅳ' },
      ],
    });
    renderImportPreviewView(container, { parsed, onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    const forms = await listFormsForChild(children[0].id);
    expect(forms.map(f => f.tier).sort()).toEqual(['Ⅳ', 'Ⅴ']);

    const vForm = forms.find(f => f.tier === 'Ⅴ');
    const ivForm = forms.find(f => f.tier === 'Ⅳ');
    expect((await listEntriesForForm(vForm.id)).map(e => e.indicatorCode)).toEqual(['Ⅴ-1-1']);
    expect((await listEntriesForForm(ivForm.id)).map(e => e.indicatorCode)).toEqual(['Ⅳ-1-2']);
  });

  it('shows an error message and does not call onImported if saving fails', async () => {
    vi.spyOn(db, 'addChild').mockRejectedValueOnce(new Error('boom'));
    const container = document.createElement('div');
    let imported = false;
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.textContent.includes('匯入失敗，請再試一次'));

    expect(imported).toBe(false);
    vi.restoreAllMocks();
  });
});
