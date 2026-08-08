import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild, addForm, addEntry, listEntriesForForm } from '../src/storage/db.js';
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

  it('renders every indicator for the form’s tier, grouped with its domain', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    expect(container.textContent).toContain('Ⅳ-1-1');
    expect(container.textContent).toContain('能獨立穩定行走');
    expect(container.textContent).toContain('身體動作');
  });

  it('renders existing entries under their indicator', async () => {
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

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
    container.querySelector('[data-entry-field="achieved"][data-indicator-code="Ⅳ-1-1"]').checked = true;
    container.querySelector('[data-entry-field="note"][data-indicator-code="Ⅳ-1-1"]').value = '可以來回穩定行走';
    container.querySelector('[data-entry-save-for="Ⅳ-1-1"]').click();

    await waitFor(() => container.textContent.includes('可以來回穩定行走'));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('可以來回穩定行走');
    expect(container.textContent).toContain('可以來回穩定行走');
  });

  it('deletes an entry after confirmation', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-entry="${entry.id}"]`).click();
    await waitFor(() => !container.querySelector(`[data-delete-entry="${entry.id}"]`));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(0);
  });

  it('keeps the entry when deletion is not confirmed', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

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
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const editForm = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
    expect(editForm.hidden).toBe(true);

    container.querySelector(`[data-edit-entry="${entry.id}"]`).click();
    expect(editForm.hidden).toBe(false);
    expect(container.querySelector(`[data-entry-edit-field="date"][data-entry-id="${entry.id}"]`).value).toBe('2026-01-07');
    expect(container.querySelector(`[data-entry-edit-field="achieved"][data-entry-id="${entry.id}"]`).checked).toBe(true);
    expect(container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value).toBe('可以來回穩定行走');

    container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value = '現在走得更穩了';
    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).click();

    await waitFor(() => container.textContent.includes('現在走得更穩了'));

    const [updated] = await listEntriesForForm(form.id);
    expect(updated.note).toBe('現在走得更穩了');
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
      achieved: true,
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
