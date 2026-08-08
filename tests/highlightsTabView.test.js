import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addHighlightEntry } from '../src/storage/parentReportDb.js';
import { renderHighlightsTab } from '../src/ui/highlightsTabView.js';
import { waitFor } from './helpers.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

function dropFile(dropTarget, file) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { configurable: true, value: { files: [file] } });
  dropTarget.dispatchEvent(event);
}

describe('renderHighlightsTab', () => {
  let report;

  beforeEach(async () => {
    await clearAllData();
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders existing highlight entries with their caption', async () => {
    await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: '我最喜歡騎車車了！',
    });

    const container = document.createElement('div');
    await renderHighlightsTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('我最喜歡騎車車了！');
  });

  it('compresses a selected photo and shows a preview in that slot', async () => {
    const imagePreprocess = await import('../src/media/imagePreprocess.js');
    vi.spyOn(imagePreprocess, 'compressImage').mockResolvedValue({ blob: new Blob(['x']), width: 100, height: 80 });

    const container = document.createElement('div');
    await renderHighlightsTab(container, { report, onChange: () => {} });

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    selectFile(container.querySelector('[data-photo-slot="0"]'), file);

    await waitFor(() => container.querySelector('[data-preview-slot="0"] img') !== null);
    expect(container.querySelector('[data-preview-slot="0"] img')).not.toBeNull();
  });

  it('compresses a dropped photo and shows a preview in that slot', async () => {
    const imagePreprocess = await import('../src/media/imagePreprocess.js');
    vi.spyOn(imagePreprocess, 'compressImage').mockResolvedValue({ blob: new Blob(['x']), width: 100, height: 80 });

    const container = document.createElement('div');
    await renderHighlightsTab(container, { report, onChange: () => {} });

    const file = new File(['x'], 'dropped.jpg', { type: 'image/jpeg' });
    dropFile(container.querySelector('[data-drop-slot="1"]'), file);

    await waitFor(() => container.querySelector('[data-preview-slot="1"] img') !== null);
    expect(container.querySelector('[data-preview-slot="1"] img')).not.toBeNull();
  });

  it('adds a highlight entry with 1-3 compressed photos and a caption', async () => {
    const imagePreprocess = await import('../src/media/imagePreprocess.js');
    vi.spyOn(imagePreprocess, 'compressImage').mockResolvedValue({ blob: new Blob(['x']), width: 100, height: 80 });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    selectFile(container.querySelector('[data-photo-slot="0"]'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await waitFor(() => container.querySelector('[data-preview-slot="0"] img') !== null);

    container.querySelector('[data-field="caption"]').value = '我最喜歡騎車車了！';
    container.querySelector('[data-action="add-highlight"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('rejects submission with zero photos', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector('[data-field="caption"]').value = '沒有照片';
    container.querySelector('[data-action="add-highlight"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('請至少上傳一張照片'));
    expect(changed).toBe(false);
  });

  it('deletes a highlight entry via the light-pink circular delete button after confirmation', async () => {
    const entry = await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: 'x',
    });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => true });

    const deleteBtn = container.querySelector(`[data-delete-highlight="${entry.id}"]`);
    expect(deleteBtn.classList.contains('btn--delete-circle')).toBe(true);
    expect(deleteBtn.getAttribute('aria-label')).toContain('x');

    deleteBtn.click();
    await waitFor(() => changed);
  });

  it('keeps the highlight entry when deletion is not confirmed', async () => {
    const entry = await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: 'x',
    });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => false });

    container.querySelector(`[data-delete-highlight="${entry.id}"]`).click();

    const parentReportDb = await import('../src/storage/parentReportDb.js');
    const remaining = await parentReportDb.listHighlightEntriesForReport(report.id);
    expect(remaining).toHaveLength(1);
    expect(changed).toBe(false);
  });

  it('removes a pending photo via its × button, and the form can still submit with the remaining photo', async () => {
    const imagePreprocess = await import('../src/media/imagePreprocess.js');
    vi.spyOn(imagePreprocess, 'compressImage').mockResolvedValue({ blob: new Blob(['x']), width: 100, height: 80 });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    selectFile(container.querySelector('[data-photo-slot="0"]'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await waitFor(() => container.querySelector('[data-preview-slot="0"] img') !== null);
    selectFile(container.querySelector('[data-photo-slot="1"]'), new File(['x'], 'b.jpg', { type: 'image/jpeg' }));
    await waitFor(() => container.querySelector('[data-preview-slot="1"] img') !== null);

    container.querySelector('[data-remove-pending-slot="0"]').click();

    expect(container.querySelector('[data-preview-slot="0"] img')).toBeNull();
    expect(container.querySelector('[data-preview-slot="1"] img')).not.toBeNull();

    container.querySelector('[data-field="caption"]').value = '還有一張照片';
    container.querySelector('[data-action="add-highlight"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('clicking a pending photo\'s remove button does not also open the native file picker', async () => {
    const imagePreprocess = await import('../src/media/imagePreprocess.js');
    vi.spyOn(imagePreprocess, 'compressImage').mockResolvedValue({ blob: new Blob(['x']), width: 100, height: 80 });

    const container = document.createElement('div');
    await renderHighlightsTab(container, { report, onChange: () => {} });

    selectFile(container.querySelector('[data-photo-slot="0"]'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await waitFor(() => container.querySelector('[data-preview-slot="0"] img') !== null);

    const input = container.querySelector('[data-photo-slot="0"]');
    const inputClickSpy = vi.fn();
    input.addEventListener('click', inputClickSpy);

    container.querySelector('[data-remove-pending-slot="0"]').click();

    expect(inputClickSpy).not.toHaveBeenCalled();
  });

  it('removes a saved photo via its × button: calls updateHighlightEntry with that photo removed, and triggers onChange', async () => {
    const parentReportDb = await import('../src/storage/parentReportDb.js');
    const updateSpy = vi.spyOn(parentReportDb, 'updateHighlightEntry');

    const entry = await addHighlightEntry({
      reportId: report.id,
      photos: [
        { blob: new Blob(['a']), width: 10, height: 10 },
        { blob: new Blob(['b']), width: 20, height: 20 },
      ],
      caption: '兩張照片',
    });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-remove-saved-photo="${entry.id}"][data-photo-index="1"]`).click();
    await waitFor(() => changed);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [calledId, calledChanges] = updateSpy.mock.calls[0];
    expect(calledId).toBe(entry.id);
    // Compare by the distinguishing width/height rather than blob identity: fake-indexeddb
    // structured-clones stored Blobs, so the photo object read back for rendering is never
    // the same reference (or even the same Blob subclass) as the one passed into
    // addHighlightEntry — asserting index-0's dimensions survived (and index-1's didn't) is
    // what actually matters here, not object identity.
    expect(calledChanges.photos).toHaveLength(1);
    expect(calledChanges.photos[0].width).toBe(10);
    expect(calledChanges.photos[0].height).toBe(10);
  });

  it('allows removing the last remaining photo from an entry, leaving it with zero photos rather than deleting it', async () => {
    const entry = await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: '只有一張照片',
    });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-remove-saved-photo="${entry.id}"][data-photo-index="0"]`).click();
    await waitFor(() => changed);

    const parentReportDb = await import('../src/storage/parentReportDb.js');
    const [updated] = await parentReportDb.listHighlightEntriesForReport(report.id);
    expect(updated).toBeDefined();
    expect(updated.photos).toEqual([]);
    expect(updated.caption).toBe('只有一張照片');
  });

  it('edits a highlight entry caption via the inline 編輯 form', async () => {
    const entry = await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: '原始描述',
    });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    const form = container.querySelector(`[data-highlight-edit-form-for="${entry.id}"]`);
    expect(form.hidden).toBe(true);

    const editBtn = container.querySelector(`[data-edit-highlight="${entry.id}"]`);
    expect(editBtn.classList.contains('btn--edit')).toBe(true);
    editBtn.click();
    expect(form.hidden).toBe(false);

    const textarea = container.querySelector(`[data-highlight-edit-field="caption"][data-highlight-id="${entry.id}"]`);
    expect(textarea.value).toBe('原始描述');
    textarea.value = '更新後的描述';

    container.querySelector(`[data-highlight-edit-save-for="${entry.id}"]`).click();
    await waitFor(() => changed);

    const parentReportDb = await import('../src/storage/parentReportDb.js');
    const [updated] = await parentReportDb.listHighlightEntriesForReport(report.id);
    expect(updated.caption).toBe('更新後的描述');
  });

  it('cancels the highlight edit form without saving changes', async () => {
    const entry = await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: '原始描述',
    });

    const container = document.createElement('div');
    await renderHighlightsTab(container, { report, onChange: () => {} });

    container.querySelector(`[data-edit-highlight="${entry.id}"]`).click();
    const form = container.querySelector(`[data-highlight-edit-form-for="${entry.id}"]`);
    expect(form.hidden).toBe(false);

    container.querySelector(`[data-highlight-edit-cancel-for="${entry.id}"]`).click();
    expect(form.hidden).toBe(true);
  });
});
