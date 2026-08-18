# 統一匯入（首頁自動辨識匯入） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single "匯入檔案" entry point on the home screen (`reportTypeSelectView.js`)
that accepts multiple `.docx` files at once, auto-detects which of the three existing form
types (適性總表／適性紀錄／課程月計畫) each file belongs to, and routes each to its existing
parser + preview screen — no changes to the three existing per-feature import buttons or to
the three existing parsers/preview screens.

**Architecture:** A new detection module (`src/import/unifiedDocxImport.js`) sniffs each
file's `word/document.xml`/`header*.xml` raw text for three already-distinctive markers (see
design doc) and delegates to the matching existing `parseDocxImport`/
`parseParentReportDocxImport`/`parseMonthlyPlanDocxImport`, tagging the result with its type.
The home screen reuses the existing `processImportQueue` (`src/ui/importQueue.js`, untouched)
with a small dispatcher `renderPreview` that picks the matching existing preview component by
tag. See `docs/superpowers/specs/2026-08-18-unified-docx-import-design.md` for full rationale.

**Tech Stack:** Vanilla JS, `jszip` (already a dependency), `vitest`/`jsdom`/`fake-indexeddb`.

## Global Constraints

- Do not modify `src/ui/importQueue.js`, the three existing preview views, or the three
  existing parsers — only add new code that composes them.
- Do not remove the existing per-feature import buttons in `childListView.js` /
  `monthlyPlanListView.js`.
- An unrecognized file must be skipped (not crash the queue), surfaced via the existing
  skipped-file summary (`data-error="import"`), consistent with today's "parse throws → file
  skipped" behavior.

---

### Task 1: `src/import/unifiedDocxImport.js`

**Files:**
- Create: `src/import/unifiedDocxImport.js`
- Test: Create `tests/unifiedDocxImport.test.js`

**Interfaces:**
- `detectDocxImportType(file): Promise<'assessment' | 'parent-report' | 'monthly-plan' | null>`
- `parseUnifiedDocxImport(file): Promise<{ type, parsed }>` — throws `Error('無法辨識檔案類型')`
  when detection returns `null`.

- [ ] **Step 1: Write failing tests first** (TDD — see `tests/docxImport.test.js` /
  `tests/monthlyPlanDocxImport.acceptance.test.js` for the round-trip style to match)
  - Build one file via each of `generateDocxBlob`, `generateParentReportDocxBlob`,
    `generateMonthlyPlanDocxBlob` (wrap each blob in `new File([blob], name, { type: ... })`,
    matching `childListView.test.js`'s `buildSampleDocxFile` pattern — avoids the jsdom
    Blob/FileReader quirk noted in `monthlyPlanDocxImport.acceptance.test.js`).
  - Assert `detectDocxImportType` returns the right tag for each.
  - Assert `parseUnifiedDocxImport` returns `{ type, parsed }` where `parsed` matches what
    calling the type-specific parser directly on the same file would return.
  - Build one more file with unrelated plain text as `word/document.xml` (no markers at all)
    and assert `detectDocxImportType` returns `null`, `parseUnifiedDocxImport` rejects.

  ```js
  import JSZip from 'jszip';
  import { describe, it, expect } from 'vitest';
  import { generateDocxBlob } from '../src/export/docxExport.js';
  import { generateParentReportDocxBlob } from '../src/export/parentReportDocxExport.js';
  import { generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';
  import { getIndicatorsForTier } from '../src/data/indicators.js';
  import { detectDocxImportType, parseUnifiedDocxImport } from '../src/import/unifiedDocxImport.js';

  // ...build sample File for each of the three generators (see childListView.test.js for the
  // assessment/parent-report shape; monthlyPlanDocxImport.acceptance.test.js for the plan/
  // children/slots/itemsBySlotId/overrides shape expected by generateMonthlyPlanDocxBlob)...

  it('detects and parses an unrecognized docx as null/throws', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'random.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    expect(await detectDocxImportType(file)).toBeNull();
    await expect(parseUnifiedDocxImport(file)).rejects.toThrow('無法辨識檔案類型');
  });
  ```

- [ ] **Step 2: Implement `src/import/unifiedDocxImport.js`**

  ```js
  import JSZip from 'jszip';
  import { parseDocxImport } from './docxImport.js';
  import { parseParentReportDocxImport } from './parentReportDocxImport.js';
  import { parseMonthlyPlanDocxImport } from './monthlyPlanDocxImport.js';

  async function readXmlParts(file) {
    const zip = await JSZip.loadAsync(file);
    const documentXml = (await zip.file('word/document.xml')?.async('text')) ?? '';
    const headerNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/.test(name));
    const headerXmls = await Promise.all(headerNames.map(name => zip.file(name).async('text')));
    return { documentXml, headerXmls };
  }

  export async function detectDocxImportType(file) {
    const { documentXml, headerXmls } = await readXmlParts(file);

    if (/點滴分享|行為觀察/.test(documentXml)) return 'parent-report';
    if (/\d{1,3}年\d{1,2}月課程計畫/.test([documentXml, ...headerXmls].join('\n'))) return 'monthly-plan';
    if (/幼兒姓名/.test(documentXml)) return 'assessment';
    return null;
  }

  export async function parseUnifiedDocxImport(file) {
    const type = await detectDocxImportType(file);
    if (!type) throw new Error('無法辨識檔案類型');
    if (type === 'parent-report') return { type, parsed: await parseParentReportDocxImport(file) };
    if (type === 'monthly-plan') return { type, parsed: await parseMonthlyPlanDocxImport(file) };
    return { type, parsed: await parseDocxImport(file) };
  }
  ```

- [ ] **Step 3: Run `npx vitest run tests/unifiedDocxImport.test.js`, confirm green.**

---

### Task 2: Wire the home-screen button in `reportTypeSelectView.js`

**Files:**
- Modify: `src/ui/reportTypeSelectView.js`
- Test: Create `tests/reportTypeSelectView.test.js` (or extend if one already exists by the
  time this task runs)

**Interfaces:** No signature change to `renderReportTypeSelectView(container, { onSelectType })`
— the import button is wired internally, matching how `childListView.js` wires its own import
button using params it already received.

- [ ] **Step 1: Write failing tests first**
  - Mirror `childListView.test.js`'s `selectFile`/`buildSampleDocxFile`/
    `buildSampleParentReportDocxFile` helpers (add a `buildSampleMonthlyPlanDocxFile` helper
    too, using the `generateMonthlyPlanDocxBlob` fixture shape from
    `monthlyPlanDocxImport.acceptance.test.js`).
  - Render `reportTypeSelectView`, select one assessment file → assert container text
    includes exactly `確認匯入內容` (and not the parenthesized variants).
  - Render fresh, select one parent-report file → assert text includes `確認匯入內容（適性紀錄）`.
  - Render fresh, select one monthly-plan file → assert text includes `確認匯入內容（課程月計畫）`.
  - Render fresh, use `selectFiles` (plural, already defined in `childListView.test.js` —
    duplicate or share the helper) with `[assessmentFile, parentReportFile]` → after
    confirming/cancelling the first preview via its own onImported/onCancel path, assert the
    second file's preview screen appears next (mirrors the existing multi-file queue tests'
    intent, adapted to mixed types).
  - Select an unrecognized file → assert `[data-error="import"]` ends up containing the
    filename after the queue finishes.

- [ ] **Step 2: Implement the button in `reportTypeSelectView.js`**
  - Add to the header markup (same `page-header` bar as the title), matching
    `childListView.js`'s existing button/hidden-input/`data-error="import"` markup:
    ```html
    <button type="button" class="btn btn--purple" data-action="import-any-docx">匯入檔案</button>
    <input type="file" accept=".docx" data-field="import-any-file" multiple hidden>
    ```
    and a `<p class="field-error field-error--center" data-error="import"></p>` below the
    header.
  - Import `processImportQueue` from `./importQueue.js`, `parseUnifiedDocxImport` from
    `../import/unifiedDocxImport.js`, and the three existing preview renderers
    (`renderImportPreviewView`, `renderParentReportImportPreviewView`,
    `renderMonthlyPlanImportPreviewView`).
  - After the existing `container.innerHTML = ...` and the three `onSelectType` listeners,
    wire the new input's `change` event:
    ```js
    const importFileInput = container.querySelector('[data-field="import-any-file"]');
    container.querySelector('[data-action="import-any-docx"]').addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', async () => {
      if (importFileInput.files.length === 0) return;
      await processImportQueue(importFileInput.files, {
        parseFn: parseUnifiedDocxImport,
        renderPreview: (container, { parsed: { type, parsed }, onCancel, onImported }) => {
          const render = {
            assessment: renderImportPreviewView,
            'parent-report': renderParentReportImportPreviewView,
            'monthly-plan': renderMonthlyPlanImportPreviewView,
          }[type];
          render(container, { parsed, onCancel, onImported });
        },
        container,
        backToList: () => renderReportTypeSelectView(container, { onSelectType }),
      });
    });
    ```
- [ ] **Step 3: Run `npx vitest run tests/reportTypeSelectView.test.js tests/childListView.test.js tests/monthlyPlanListView.test.js`, confirm all green** (the latter two guard against
  accidentally touching the untouched per-feature import buttons).

---

### Task 3: Full regression + manual smoke check

- [ ] Run the full suite: `npx vitest run tests/` (scoped path per CLAUDE.md's stale-worktree
  test-doubling note).
- [ ] `npm run build`, open `dist/TableC.html`, manually import one file of each type plus one
  unrelated docx from the home screen; confirm routing and the skipped-file message.
- [ ] Commit.
