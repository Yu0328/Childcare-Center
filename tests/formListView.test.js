import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild, addForm } from '../src/storage/db.js';
import { renderFormListView } from '../src/ui/formListView.js';
import { waitFor } from './helpers.js';

describe('renderFormListView', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('renders existing forms for the child', async () => {
    await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('Ⅳ');
    expect(container.textContent).toContain('115年01月');
  });

  it('pre-selects the tier suggested by the child\'s current age', async () => {
    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {} });

    const tierSelect = container.querySelector('[data-field="tier"]');
    expect(tierSelect.value).not.toBe('');
  });

  it('allows overriding the tier and creates a second form for the same tier', async () => {
    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {} });

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="period-year"]').value = '115';
    container.querySelector('[data-field="period-month"]').value = '1';
    container.querySelector('[data-action="add-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.textContent.includes('115年01月'));

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="period-year"]').value = '115';
    container.querySelector('[data-field="period-month"]').value = '2';
    container.querySelector('[data-action="add-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.textContent.includes('115年02月'));

    expect(container.textContent).toContain('115年01月');
    expect(container.textContent).toContain('115年02月');
  });

  it('calls onSelectForm with the clicked form', async () => {
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const container = document.createElement('div');
    let selected = null;
    await renderFormListView(container, { child, onSelectForm: f => { selected = f; }, onBack: () => {} });

    container.querySelector(`[data-form-id="${form.id}"]`).click();

    expect(selected).toEqual(form);
  });
  it('deletes a form after confirmation and re-renders the list without it', async () => {
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-form="${form.id}"]`).click();

    await waitFor(() => !container.textContent.includes('115年01月'));
    expect(container.textContent).not.toContain('115年01月');
  });

  it('keeps the form when deletion is not confirmed', async () => {
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {}, confirmDelete: () => false });

    container.querySelector(`[data-delete-form="${form.id}"]`).click();

    expect(container.textContent).toContain('115年01月');
  });

  it('shows an error message when deleting a form fails', async () => {
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    const dbModule = await import('../src/storage/db.js');
    vi.spyOn(dbModule, 'deleteForm').mockRejectedValueOnce(new Error('Database error'));

    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-form="${form.id}"]`).click();

    await waitFor(() => container.textContent.includes('刪除失敗，請再試一次'));
    expect(container.textContent).toContain('115年01月');

    vi.restoreAllMocks();
  });

  it('renders a malicious child name and form period as inert text, not markup', async () => {
    const evilChild = await addChild({ name: '<img src=x onerror="window.__xss=1">', birthDate: '2024-11-01' });
    await addForm({ childId: evilChild.id, tier: 'Ⅳ', period: '<script>window.__xss = true;</script>' });

    const container = document.createElement('div');
    await renderFormListView(container, { child: evilChild, onSelectForm: () => {}, onBack: () => {} });

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).toContain('&lt;script&gt;');
    expect(container.textContent).toContain('<script>window.__xss = true;</script>');
  });

  it('calls onAggregate when the "從適性紀錄彙整" button is clicked', async () => {
    const container = document.createElement('div');
    const onAggregate = vi.fn();
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {}, onAggregate });

    container.querySelector('[data-action="aggregate"]').click();

    expect(onAggregate).toHaveBeenCalled();
  });
});
