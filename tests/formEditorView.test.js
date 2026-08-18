import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild, addForm, addEntry, listEntriesForForm, getForm } from '../src/storage/db.js';
import { renderFormEditorView } from '../src/ui/formEditorView.js';
import { waitFor } from './helpers.js';

describe('renderFormEditorView', () => {
  let child;
  let form;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
  });

  it('clears the imported form\'s isNew flag as soon as it is opened', async () => {
    const importedForm = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年02月', isNew: true });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form: importedForm, onBack: () => {} });

    expect(importedForm.isNew).toBe(false);
    expect((await getForm(importedForm.id)).isNew).toBe(false);
  });

  it('renders every indicator for the form’s tier, grouped with its domain', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    expect(container.textContent).toContain('Ⅳ-1-1');
    expect(container.textContent).toContain('能獨立穩定行走');
    expect(container.textContent).toContain('身體動作');
  });

  // The 請假/更換課程 label prints in the 說明 line only, not next to the date — a flagged entry's
  // date must stay a plain date, or the label would show twice whenever the teacher also
  // separately typed "請假" as their own note text.
  it('shows the flagged status label ("請假") in the 說明 line, not next to the date', async () => {
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'absent', note: '生病請假' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const dateEl = container.querySelector('.entry-row__date');
    const noteEl = container.querySelector('.entry-row__note');
    expect(dateEl.textContent).not.toContain('請假');
    expect(noteEl.textContent).toBe('請假　生病請假');
  });

  it('renders existing entries under their indicator', async () => {
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    expect(container.textContent).toContain('可以來回穩定行走');
  });

  it('adds a new entry for an indicator via its inline form', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const addButton = container.querySelector('[data-add-entry-for="Ⅳ-1-1"]');
    addButton.click();

    container.querySelector('[data-entry-field="date"][data-indicator-code="Ⅳ-1-1"]').value = '2026-01-07';
    container.querySelector('[data-entry-field="status"][data-indicator-code="Ⅳ-1-1"][value="developed"]').checked = true;
    container.querySelector('[data-entry-field="note"][data-indicator-code="Ⅳ-1-1"]').value = '可以來回穩定行走';
    container.querySelector('[data-entry-save-for="Ⅳ-1-1"]').click();

    await waitFor(() => container.textContent.includes('可以來回穩定行走'));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('可以來回穩定行走');
    expect(entries[0].status).toBe('developed');
    expect(container.textContent).toContain('可以來回穩定行走');
  });

  it('adds a new entry with 發展中△ status when that radio is selected, and shows the △ mark', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector('[data-add-entry-for="Ⅳ-1-1"]').click();
    container.querySelector('[data-entry-field="date"][data-indicator-code="Ⅳ-1-1"]').value = '2026-01-07';
    container.querySelector('[data-entry-field="status"][data-indicator-code="Ⅳ-1-1"][value="developing"]').checked = true;
    container.querySelector('[data-entry-field="note"][data-indicator-code="Ⅳ-1-1"]').value = '仍在練習';
    container.querySelector('[data-entry-save-for="Ⅳ-1-1"]').click();

    await waitFor(() => container.textContent.includes('仍在練習'));

    const entries = await listEntriesForForm(form.id);
    expect(entries[0].status).toBe('developing');
    expect(container.querySelector(`[data-entry="${entries[0].id}"] .entry-row__mark`).textContent).toBe('△');
  });

  it('deletes an entry after confirmation', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-entry="${entry.id}"]`).click();
    await waitFor(() => !container.querySelector(`[data-delete-entry="${entry.id}"]`));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(0);
  });

  it('keeps the entry when deletion is not confirmed', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {}, confirmDelete: () => false });

    container.querySelector(`[data-delete-entry="${entry.id}"]`).click();

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(container.querySelector(`[data-delete-entry="${entry.id}"]`)).not.toBeNull();
  });

  it('toggles the add-entry form open and closed when "＋ 新增觀察紀錄" is clicked repeatedly', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const toggleButton = container.querySelector('[data-add-entry-for="Ⅳ-1-1"]');
    const entryForm = container.querySelector('[data-entry-form-for="Ⅳ-1-1"]');
    expect(entryForm.hidden).toBe(true);

    toggleButton.click();
    expect(entryForm.hidden).toBe(false);

    toggleButton.click();
    expect(entryForm.hidden).toBe(true);
  });

  it('edits an existing entry: shows a pre-filled form, saves via updateEntry, and re-renders with the new value', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const editForm = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
    expect(editForm.hidden).toBe(true);

    container.querySelector(`[data-edit-entry="${entry.id}"]`).click();
    expect(editForm.hidden).toBe(false);
    expect(container.querySelector(`[data-entry-edit-field="date"][data-entry-id="${entry.id}"]`).value).toBe('2026-01-07');
    expect(container.querySelector(`[data-entry-edit-field="status"][data-entry-id="${entry.id}"][value="developed"]`).checked).toBe(true);
    expect(container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value).toBe('可以來回穩定行走');

    container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value = '現在走得更穩了';
    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).click();

    await waitFor(() => container.textContent.includes('現在走得更穩了'));

    const [updated] = await listEntriesForForm(form.id);
    expect(updated.note).toBe('現在走得更穩了');
  });

  it('changes an entry from 已發展○ to 發展中△ via the edit form', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: 'x' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector(`[data-edit-entry="${entry.id}"]`).click();
    container.querySelector(`[data-entry-edit-field="status"][data-entry-id="${entry.id}"][value="developing"]`).checked = true;
    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).click();

    await waitFor(async () => (await listEntriesForForm(form.id))[0].status === 'developing');

    const [updated] = await listEntriesForForm(form.id);
    expect(updated.status).toBe('developing');
  });

  it('exports with a filename using the tier-mapped form letter (Ⅳ 階段 → C表)', async () => {
    const docxExportModule = await import('../src/export/docxExport.js');
    const downloadSpy = vi.spyOn(docxExportModule, 'downloadDocx').mockImplementation(() => {});

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector('[data-action="export"]').click();
    await waitFor(() => downloadSpy.mock.calls.length > 0);

    expect(downloadSpy).toHaveBeenCalledWith(expect.anything(), '陳小安-C表-115年01月.docx');

    vi.restoreAllMocks();
  });

  it('always shows the 備註 section on screen, even with nothing to remark on, and lists the child\'s still-developing entries from their previous tier when there are some', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });
    expect(container.querySelector('[data-remark-section]')).not.toBeNull();

    const previousForm = await addForm({ childId: child.id, tier: 'Ⅲ', period: '114年10月' });
    await addEntry({ formId: previousForm.id, indicatorCode: 'Ⅲ-1-1', date: '2025-10-05', status: 'developing', note: '仍在練習扶物站立' });
    await addEntry({ formId: previousForm.id, indicatorCode: 'Ⅲ-1-2', date: '2025-10-05', status: 'developed', note: '已完成' });

    const container2 = document.createElement('div');
    await renderFormEditorView(container2, { child, form, onBack: () => {} });

    const remarkSection = container2.querySelector('[data-remark-section]');
    expect(remarkSection).not.toBeNull();
    expect(remarkSection.textContent).toContain('Ⅲ-1-1');
    expect(remarkSection.textContent).toContain('仍在練習扶物站立');
    expect(remarkSection.textContent).not.toContain('Ⅲ-1-2');
    expect(remarkSection.textContent).not.toContain('已完成');
  });

  it('shows an unresolved-code entry left on this same form (e.g. by 彙整) in 備註 too, editable/deletable from here, without crashing the main table\'s own delete/edit wiring for it', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-9-9', date: '2026-01-05', status: 'developed', note: '無法對應到系統指標', activityName: '我大大了' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const remarkSection = container.querySelector('[data-remark-section]');
    expect(remarkSection).not.toBeNull();
    expect(remarkSection.textContent).toContain('Ⅳ-9-9');
    expect(remarkSection.textContent).toContain('無法對應到系統指標');
    // Falls back to the stored activityName since the code doesn't resolve to a real indicator.
    expect(remarkSection.textContent).toContain('我大大了');
    // Not wired via the main table's own delete/edit mechanism (no crash from that).
    expect(remarkSection.querySelector('[data-delete-entry]')).toBeNull();
    expect(remarkSection.querySelector('[data-edit-entry]')).toBeNull();
    // Has its own remark-specific edit/delete buttons instead, since it lives on this same form.
    expect(remarkSection.querySelector(`[data-delete-remark="${entry.id}"]`)).not.toBeNull();
    expect(remarkSection.querySelector(`[data-edit-remark="${entry.id}"]`)).not.toBeNull();
  });

  it('edits a local remark\'s label/date/status/note via its inline edit form', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: '自訂', date: '2026-01-05', status: 'developed', note: '原始內容' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector(`[data-edit-remark="${entry.id}"]`).click();
    const editForm = container.querySelector(`[data-remark-edit-form-for="${entry.id}"]`);
    expect(editForm.hidden).toBe(false);

    container.querySelector(`[data-remark-edit-field="code"][data-remark-id="${entry.id}"]`).value = '改過的標籤';
    container.querySelector(`[data-remark-edit-field="note"][data-remark-id="${entry.id}"]`).value = '改過的內容';
    container.querySelector(`[data-remark-edit-save-for="${entry.id}"]`).click();

    await waitFor(() => container.textContent.includes('改過的內容'));

    const [updated] = await listEntriesForForm(form.id);
    expect(updated).toMatchObject({ indicatorCode: '改過的標籤', note: '改過的內容' });
  });

  it('edits a local remark\'s activityName fallback (e.g. "我大大了") via its inline edit form', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-9-9', date: '2026-01-05', status: 'developed', note: '無法對應到系統指標', activityName: '我大大了' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector(`[data-edit-remark="${entry.id}"]`).click();
    const activityNameField = container.querySelector(`[data-remark-edit-field="activityName"][data-remark-id="${entry.id}"]`);
    expect(activityNameField.value).toBe('我大大了');

    activityNameField.value = '我長高了';
    container.querySelector(`[data-remark-edit-save-for="${entry.id}"]`).click();

    await waitFor(() => container.textContent.includes('我長高了'));

    const [updated] = await listEntriesForForm(form.id);
    expect(updated.activityName).toBe('我長高了');
  });

  it('deletes a local remark (unresolved-code entry on this form) after confirmation', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-9-9', date: '2026-01-05', status: 'developed', note: 'x' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-remark="${entry.id}"]`).click();
    await waitFor(() => !container.querySelector(`[data-delete-remark="${entry.id}"]`));

    expect(await listEntriesForForm(form.id)).toEqual([]);
  });

  it('does not offer a delete button for a remark sourced from a different (previous-tier) form', async () => {
    const previousForm = await addForm({ childId: child.id, tier: 'Ⅲ', period: '114年10月' });
    const entry = await addEntry({ formId: previousForm.id, indicatorCode: 'Ⅲ-1-1', date: '2025-10-05', status: 'developing', note: '仍在練習扶物站立' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    expect(container.querySelector(`[data-delete-remark="${entry.id}"]`)).toBeNull();
  });

  it('lets the teacher add a manual remark, which lands on this form and is shown/deletable like other local remarks', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector('[data-action="add-remark"]').click();
    container.querySelector('[data-remark-field="code"]').value = '自訂備註';
    container.querySelector('[data-remark-field="date"]').value = '2026-01-05';
    container.querySelector('[data-remark-field="note"]').value = '老師手動加的備註';
    container.querySelector('[data-action="save-remark"]').click();

    await waitFor(() => container.textContent.includes('老師手動加的備註'));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toMatchObject([{ indicatorCode: '自訂備註', date: '2026-01-05', note: '老師手動加的備註' }]);

    const remarkSection = container.querySelector('[data-remark-section]');
    expect(remarkSection.querySelector(`[data-delete-remark="${entries[0].id}"]`)).not.toBeNull();
  });

  it('passes the child\'s still-developing entries from their previous tier (Ⅲ) into the export, but not their already-developed ones', async () => {
    const previousForm = await addForm({ childId: child.id, tier: 'Ⅲ', period: '114年10月' });
    await addEntry({ formId: previousForm.id, indicatorCode: 'Ⅲ-1-1', date: '2025-10-05', status: 'developing', note: '仍在練習扶物站立' });
    await addEntry({ formId: previousForm.id, indicatorCode: 'Ⅲ-1-2', date: '2025-10-05', status: 'developed', note: '已完成' });

    const docxExportModule = await import('../src/export/docxExport.js');
    const generateSpy = vi.spyOn(docxExportModule, 'generateDocxBlob');
    vi.spyOn(docxExportModule, 'downloadDocx').mockImplementation(() => {});

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector('[data-action="export"]').click();
    await waitFor(() => generateSpy.mock.calls.length > 0);

    const previousTierEntries = generateSpy.mock.calls[0][0].previousTierEntries;
    expect(previousTierEntries.map(e => e.indicatorCode)).toEqual(['Ⅲ-1-1']);

    vi.restoreAllMocks();
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    const onBack = vi.fn();
    await renderFormEditorView(container, { child, form, onBack });

    container.querySelector('[data-action="back"]').click();

    expect(onBack).toHaveBeenCalled();
  });
  it('renders a malicious entry note as inert text, not markup', async () => {
    await addEntry({
      formId: form.id,
      indicatorCode: 'Ⅳ-1-1',
      date: '2026-01-07',
      status: 'developed',
      note: '<script>window.__xss = true;</script>',
    });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).toContain('&lt;script&gt;');
    expect(container.textContent).toContain('<script>window.__xss = true;</script>');
  });

  it('renders a malicious child name in the heading as inert text', async () => {
    const evilChild = { ...child, name: '<img src=x onerror="window.__xss=1">' };

    const container = document.createElement('div');
    await renderFormEditorView(container, { child: evilChild, form, onBack: () => {} });

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).toContain('&lt;img');
  });
});
