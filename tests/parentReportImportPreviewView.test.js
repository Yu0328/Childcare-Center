import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { clearAllData, listChildren } from '../src/storage/db.js';
import * as db from '../src/storage/db.js';

// jsdom's Blob polyfill isn't recognized by Node's native structuredClone (used internally by
// fake-indexeddb to clone stored values), so a Blob round-tripped through IndexedDB in this
// (jsdom) test environment comes back as a plain object with its data lost. Swap in the native
// Blob for this file only — other test files that rely on jsdom's Blob run in their own isolated
// environment and are unaffected. Mirrors tests/parentReportDb.test.js's identical fix.
globalThis.Blob = NodeBlob;
import { listParentReportsForChild, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry, listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport } from '../src/storage/parentReportDb.js';
import { renderParentReportImportPreviewView } from '../src/ui/parentReportImportPreviewView.js';
import { waitFor } from './helpers.js';

function buildParsed(overrides = {}) {
  return {
    child: { name: '陳小安', birthDate: '2024-06-20' },
    tier: 'Ⅴ',
    period: '115年06月',
    coursePlanEntries: [
      { indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉', occurrences: [{ date: '2026-06-11', status: 'developed', absent: false, note: 'x' }] },
    ],
    developmentRecordBlocks: [{ domain: 1, courseEntryIndexes: [0], narrative: 'y' }],
    behaviorObservations: [{ title: '我會好好說！', narrative: 'z' }],
    highlightEntries: [{ photos: [new Blob(['a'], { type: 'image/png' })], caption: '開心！' }],
    warnings: [],
    ...overrides,
  };
}

describe('renderParentReportImportPreviewView', () => {
  // This view lives at the top-level 幼兒列表 page (see childListView.js), entered before any
  // child has been selected — same pattern as the sibling 適性總表 importPreviewView.js — so
  // confirming the import must create a NEW child from the (editable) form fields, mirroring
  // tests/importPreviewView.test.js's test style for the equivalent 適性總表 behavior.

  // jsdom (used by this project's test suite) does not implement URL.createObjectURL, which the
  // highlight-photo thumbnails call synchronously during render. Stub it the same way
  // tests/highlightsTabView.test.js does for the same reason.
  beforeEach(async () => {
    await clearAllData();
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not persist anything until confirmed', async () => {
    const container = document.createElement('div');
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => {} });
    expect(await listChildren()).toEqual([]);
  });

  it('pre-fills the parsed child/tier/period and lists the imported content', async () => {
    const container = document.createElement('div');
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => {} });

    expect(container.querySelector('[data-field="name"]').value).toBe('陳小安');
    expect(container.querySelector('[data-field="birthDate"]').value).toBe('2024-06-20');
    expect(container.querySelector('[data-field="tier"]').value).toBe('Ⅴ');
    expect(container.textContent).toContain('我愛畫畫');
    expect(container.textContent).not.toContain('匯入對象：');
  });

  it('creates a new child, report, and all nested records on confirm', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    // The confirm handler awaits 7 sequential IndexedDB writes (child, report, entry, occurrence,
    // record, observation, highlight) — a single setTimeout(0) tick is not enough for all of them
    // to settle, so poll with waitFor like the sibling importPreviewView.test.js does.
    await waitFor(() => imported);

    expect(imported).toBe(true);

    const children = await listChildren();
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe('陳小安');
    expect(children[0].birthDate).toBe('2024-06-20');

    const [report] = await listParentReportsForChild(children[0].id);
    expect(report.childId).toBe(children[0].id);
    const [entry] = await listCoursePlanEntriesForReport(report.id);
    expect(entry.activityName).toBe('我愛畫畫');
    expect(entry.indicatorText).toBe('能穩定握筆塗鴉');
    const [occurrence] = await listCourseOccurrencesForEntry(entry.id);
    expect(occurrence.note).toBe('x');
    const [record] = await listDevelopmentRecordEntriesForReport(report.id);
    expect(record.courseEntryIds).toEqual([entry.id]);
    const [observation] = await listBehaviorObservationsForReport(report.id);
    expect(observation.title).toBe('我會好好說！');
    const [highlight] = await listHighlightEntriesForReport(report.id);
    expect(highlight.caption).toBe('開心！');
  });

  it('excludes a course plan entry unchecked in the preview, and its dependent development record reference', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-course-entry-include="0"]').checked = false;
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    const [report] = await listParentReportsForChild(children[0].id);
    expect(await listCoursePlanEntriesForReport(report.id)).toEqual([]);
    const [record] = await listDevelopmentRecordEntriesForReport(report.id);
    expect(record.courseEntryIds).toEqual([]); // its only reference pointed at the excluded entry
  });

  it('lets the teacher correct the header fields before confirming', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderParentReportImportPreviewView(container, {
      parsed: buildParsed({ child: { name: '錯誤姓名', birthDate: '2024-06-20' } }),
      onCancel: () => {},
      onImported: () => { imported = true; },
    });

    container.querySelector('[data-field="name"]').value = '正確姓名';
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    expect(children[0].name).toBe('正確姓名');
  });

  it('calls onCancel without persisting anything', async () => {
    const container = document.createElement('div');
    let cancelled = false;
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => { cancelled = true; }, onImported: () => {} });

    container.querySelector('[data-action="cancel"]').click();
    expect(cancelled).toBe(true);
    expect(await listChildren()).toEqual([]);
  });

  it('shows an error message and does not call onImported if saving fails', async () => {
    vi.spyOn(db, 'addChild').mockRejectedValueOnce(new Error('boom'));
    const container = document.createElement('div');
    let imported = false;
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.textContent.includes('匯入失敗，請再試一次'));

    expect(imported).toBe(false);
  });
});
