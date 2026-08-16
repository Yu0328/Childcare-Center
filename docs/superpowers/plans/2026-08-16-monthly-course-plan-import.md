# 課程月計畫匯入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add docx import for 課程月計畫 (monthly course plan): parse a docx (this app's own export, or a teacher's hand-typed legacy file) into a preview screen, then commit it as a new `MonthlyCoursePlan` with its `PlanSlot`/`PlanSlotItem`/`ChildItemOverride` records.

**Architecture:** A new regex-over-raw-XML parser (`src/import/monthlyPlanDocxImport.js`, matching the existing `docxImport.js`/`parentReportDocxImport.js` style — not a real XML parser) splits each child's table into per-day cells positionally (column = week, row-pair = weekday — no date-text parsing needed), then extracts each cell's items two ways: a **precise** parser for this app's own clean export format, falling back to a **best-effort** parser for messy hand-typed legacy files. A pure reduction step collapses same-tier children's cells into one canonical `PlanSlot` template plus per-child overrides. A new preview screen (`src/ui/monthlyPlanImportPreviewView.js`) lets the user fix anything uncertain (period, per-child name match, tier) before committing — unlike the entry-level checkboxes in the sibling importers, per-cell content review is deferred to the existing full-featured `monthlyPlanEditorView.js`, not duplicated here. A small shared `processImportQueue` helper (currently private to `childListView.js`) is extracted so both 總表/適性紀錄 and 課程月計畫 import buttons share one multi-file queue implementation.

**Tech Stack:** Vanilla JS, `jszip` (already a dependency) for reading the docx zip, `vitest`/`jsdom`/`fake-indexeddb` for tests.

## Global Constraints

- Round-trip (this app's own `generateMonthlyPlanDocxBlob` output) must parse back with **zero warnings** and byte-for-byte-equivalent data (indicatorCode/activityName/indicatorText, notAchieved/replaced/replacementText, per-child tier).
- Legacy hand-typed files (`references/月計畫/*.docx`, gitignored real data — never quote their real content in code/comments/tests) are **best-effort only**: anything uncertain must produce a warning and/or require manual confirmation in the preview screen, never a silent guess treated as fact.
- Every import always creates a **brand-new** `MonthlyCoursePlan` — no merging into an existing plan for the same period (matches `docxImport.js`'s existing convention for 總表).
- Child matching uses **name only** (the exported docx has no birth date) — unique name match auto-selects; no/multiple matches require a manual pick or "create new child" in the preview screen.
- No class-name capture, no PDF import, no automated test may contain real reference-file data.

---

### Task 1: Extract `processImportQueue` into a shared module

**Files:**
- Create: `src/ui/importQueue.js`
- Modify: `src/ui/childListView.js` (remove the local `processImportQueue`, import the shared one instead)
- Test: existing `tests/childListView.test.js` (no changes needed — it already exercises this function indirectly; this task must keep it green)

**Interfaces:**
- Produces: `processImportQueue(files, { parseFn, renderPreview, container, backToList })` — async, processes a `FileList`/array one at a time. `parseFn(file)` returns a parsed object (or throws — the file is skipped and its name collected). `renderPreview(container, { parsed, onCancel, onImported })` renders the confirm screen; both `onCancel`/`onImported` advance to the next file. After the queue is empty, calls `backToList()` then writes any skipped-file names into `container.querySelector('[data-error="import"]')` if present.

- [ ] **Step 1: Create the shared module**

```js
// src/ui/importQueue.js

// Processes a multi-file selection one at a time: parses the next file, shows its own
// preview/confirm screen, and — whether the user confirms or cancels that one — moves on to
// the next file in the queue, rather than dropping back to the list until every selected file
// has had its own turn. A file that fails to parse is skipped (not aborting the rest of the
// batch); every skipped filename is reported together in one summary once the whole queue
// finishes, since the preview screens that follow would otherwise overwrite a per-file error
// before the person ever saw it.
export async function processImportQueue(files, { parseFn, renderPreview, container, backToList }) {
  const queue = Array.from(files);
  const skipped = [];

  async function next(index) {
    if (index >= queue.length) {
      await backToList();
      if (skipped.length > 0) {
        const importErrorEl = container.querySelector('[data-error="import"]');
        if (importErrorEl) importErrorEl.textContent = `以下檔案無法讀取，已略過：${skipped.join('、')}`;
      }
      return;
    }

    const file = queue[index];
    let parsed;
    try {
      parsed = await parseFn(file);
    } catch (err) {
      skipped.push(file.name);
      await next(index + 1);
      return;
    }

    renderPreview(container, {
      parsed,
      onCancel: () => next(index + 1),
      onImported: () => next(index + 1),
    });
  }

  await next(0);
}
```

- [ ] **Step 2: Update `childListView.js` to use the shared module**

In `src/ui/childListView.js`, delete the local `async function processImportQueue(...) { ... }` block entirely (lines 9-48 in the current file), and add this import alongside the existing ones at the top:

```js
import { processImportQueue } from './importQueue.js';
```

Nothing else in `childListView.js` changes — the two call sites (`processImportQueue(fileInput.files, {...})`) already call it with the same arguments.

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `npx vitest run tests/childListView.test.js`
Expected: PASS, same test count as before the change.

- [ ] **Step 4: Commit**

```bash
git add src/ui/importQueue.js src/ui/childListView.js
git commit -m "refactor: extract processImportQueue into a shared module"
```

---

### Task 2: Period parsing

**Files:**
- Create: `src/import/monthlyPlanDocxImport.js`
- Test: Create `tests/monthlyPlanDocxImport.test.js`

**Interfaces:**
- Produces: `parsePeriodFromTitleText(text)` → `"115年06月"` string or `null`. `extractTitleText(zip, documentXml)` (async) → the raw text to run that regex against (header-part text if any header contains the period pattern, else the document body text before the first table).

- [ ] **Step 1: Write the failing tests**

```js
// tests/monthlyPlanDocxImport.test.js
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parsePeriodFromTitleText, extractTitleText } from '../src/import/monthlyPlanDocxImport.js';

function zipWith({ headerXml, documentXml }) {
  const zip = new JSZip();
  if (headerXml) zip.file('word/header1.xml', headerXml);
  zip.file('word/document.xml', documentXml);
  return zip;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('parsePeriodFromTitleText', () => {
  it('extracts a clean "N年N月課程計畫" title', () => {
    expect(parsePeriodFromTitleText('115年06月課程計畫')).toBe('115年06月');
  });

  it('extracts the period even with noise digits directly before it (no separator)', () => {
    expect(parsePeriodFromTitleText('屏東縣...第1090012345號115年01月課程計畫')).toBe('115年01月');
  });

  it('pads a single-digit month to two digits', () => {
    expect(parsePeriodFromTitleText('115年6月課程計畫')).toBe('115年06月');
  });

  it('returns null when no period pattern is found', () => {
    expect(parsePeriodFromTitleText('沒有標題文字')).toBeNull();
  });
});

describe('extractTitleText', () => {
  it('prefers a header part containing the period pattern over the document body', async () => {
    const zip = zipWith({
      headerXml: `<?xml version="1.0"?><w:hdr ${NS}><w:p><w:r><w:t>115年06月課程計畫</w:t></w:r></w:p></w:hdr>`,
      documentXml: `<?xml version="1.0"?><w:document ${NS}><w:body><w:tbl></w:tbl></w:body></w:document>`,
    });
    const documentXml = await zip.file('word/document.xml').async('text');
    const text = await extractTitleText(zip, documentXml);
    expect(text).toContain('115年06月課程計畫');
  });

  it('falls back to body text before the first table when there is no header part', async () => {
    const zip = zipWith({
      documentXml: `<?xml version="1.0"?><w:document ${NS}><w:body><w:p><w:r><w:t>115年03月課程計畫</w:t></w:r></w:p><w:tbl></w:tbl></w:body></w:document>`,
    });
    const documentXml = await zip.file('word/document.xml').async('text');
    const text = await extractTitleText(zip, documentXml);
    expect(text).toContain('115年03月課程計畫');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js`
Expected: FAIL — `src/import/monthlyPlanDocxImport.js` does not exist yet.

- [ ] **Step 3: Implement**

```js
// src/import/monthlyPlanDocxImport.js
import JSZip from 'jszip';

function flatJoinedText(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
}

const PERIOD_PATTERN = /(\d{1,3})年\s*(\d{1,2})月課程計畫/;

export function parsePeriodFromTitleText(text) {
  const match = PERIOD_PATTERN.exec(text ?? '');
  if (!match) return null;
  return `${match[1]}年${match[2].padStart(2, '0')}月`;
}

export async function extractTitleText(zip, documentXml) {
  const headerNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/i.test(name));
  for (const name of headerNames) {
    const xml = await zip.file(name).async('text');
    const text = flatJoinedText(xml);
    if (PERIOD_PATTERN.test(text)) return text;
  }
  const firstTableIndex = documentXml.indexOf('<w:tbl>');
  const introXml = firstTableIndex === -1 ? documentXml : documentXml.slice(0, firstTableIndex);
  return flatJoinedText(introXml);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/monthlyPlanDocxImport.js tests/monthlyPlanDocxImport.test.js
git commit -m "feat: parse period from monthly plan docx title"
```

---

### Task 3: Child name-cell parsing

**Files:**
- Modify: `src/import/monthlyPlanDocxImport.js`
- Test: Modify `tests/monthlyPlanDocxImport.test.js`

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `parseChildNameCell(cellXml)` → `{ name: string|null, tier: string|null }`. `cellXml` is the raw inner XML of one `<w:tc>...</w:tc>` (the name cell — first cell of a child's table's first date row).

Recall from investigation: this app's own export writes the name cell as 3 clean paragraphs (name / `NNM` / `tierFormLabel(tier)`, e.g. `"C表"` or, for tier Ⅰ, the plain label `"0-3個月"`). Real legacy files instead write `姓名` + age + `/` + a single trailing tier letter (e.g. `.../D`), spread across 2-3 paragraphs, sometimes with the trailing letter in its own (decoratively red) run — the color there is NOT a notAchieved marker, it's just emphasis on the letter, and this function never looks at run colors at all (only cell TEXT).

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanDocxImport.test.js`:

```js
import { parseChildNameCell } from '../src/import/monthlyPlanDocxImport.js';

describe('parseChildNameCell', () => {
  it('parses this app\'s own export format: name / age / "X表" as three paragraphs', () => {
    const cellXml = `<w:p><w:r><w:t>趙萬竑</w:t></w:r></w:p><w:p><w:r><w:t>24M</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '趙萬竑', tier: 'Ⅴ' });
  });

  it('parses tier Ⅰ\'s own export, which has no letter (plain age-range label instead)', () => {
    const cellXml = `<w:p><w:r><w:t>陳小安</w:t></w:r></w:p><w:p><w:r><w:t>2M</w:t></w:r></w:p><w:p><w:r><w:t>0-3個月</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '陳小安', tier: 'Ⅰ' });
  });

  it('parses a legacy file\'s "name / age＋slash＋trailing letter" layout, letter possibly in its own colored run', () => {
    const cellXml = `<w:p><w:r><w:t>測試寶寶</w:t></w:r></w:p><w:p><w:r><w:t>1y6m/</w:t></w:r><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>C</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '測試寶寶', tier: 'Ⅳ' });
  });

  it('returns null tier when no recognizable tier marker is present', () => {
    expect(parseChildNameCell('<w:p><w:r><w:t>某某某</w:t></w:r></w:p>')).toEqual({ name: '某某某', tier: null });
  });

  it('returns a null name for a completely empty cell', () => {
    expect(parseChildNameCell('')).toEqual({ name: null, tier: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t parseChildNameCell`
Expected: FAIL — `parseChildNameCell` is not exported yet.

- [ ] **Step 3: Implement**

Add to `src/import/monthlyPlanDocxImport.js`:

```js
import { TIERS } from '../data/indicators.js';

function extractCellParagraphTexts(cellXml) {
  return [...cellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(m =>
    [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('')
  );
}

const TIER_LETTER_TO_CODE = new Map(TIERS.filter(t => t.formLetter).map(t => [t.formLetter, t.code]));
const TIER_LABEL_TO_CODE = new Map(TIERS.map(t => [t.label, t.code]));

export function parseChildNameCell(cellXml) {
  const paragraphs = extractCellParagraphTexts(cellXml)
    .map(t => t.trim())
    .filter(Boolean);
  const name = paragraphs[0] || null;
  const joined = paragraphs.join(' ');

  let tier = null;
  const letterMatch = /([A-E])表/.exec(joined) || /\/\s*([A-E])\b/.exec(joined);
  if (letterMatch) {
    tier = TIER_LETTER_TO_CODE.get(letterMatch[1]) || null;
  } else {
    for (const [label, code] of TIER_LABEL_TO_CODE) {
      if (joined.includes(label)) {
        tier = code;
        break;
      }
    }
  }

  return { name, tier };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t parseChildNameCell`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/monthlyPlanDocxImport.js tests/monthlyPlanDocxImport.test.js
git commit -m "feat: parse child name/tier from monthly plan name cell"
```

---

### Task 4: Table splitting into per-child, per-day cells

**Files:**
- Modify: `src/import/monthlyPlanDocxImport.js`
- Test: Modify `tests/monthlyPlanDocxImport.test.js`

**Interfaces:**
- Produces: `splitChildTables(documentXml)` → array of `{ nameCellXml, days: [{ weekIndex, weekday, dateCellXml, contentCellXml }] }`, one entry per `<w:tbl>` (one per child) found in the document. `weekIndex` is 1-based column position (1..N weeks in that table); `weekday` is 1-based row-pair position (1=Mon..5=Fri) — recovered purely from table position, not from any date text.

Recall the table shape (matches `monthlyPlanDocxExport.js`'s `buildChildTable`): row 0 = week-header row (skipped), then exactly 5 (date-row, content-row) pairs — one per weekday — each row spanning `1 (name column) + N (week columns)` cells, followed by an optional trailing notes row (ignored). The name cell only has real content on the very first date row (`weekdayIndex === 0`) — later rows carry the vertical-merge continuation, which this function doesn't need to care about since it always reads the name from that first row.

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanDocxImport.test.js`:

```js
import { splitChildTables } from '../src/import/monthlyPlanDocxImport.js';

function row(cells) {
  return `<w:tr>${cells.map(c => `<w:tc>${c}</w:tc>`).join('')}</w:tr>`;
}

// 2-week, 1-child table: header row + 5 weekday (date,content) row pairs + trailing note row.
function buildTableXml({ nameCellXml = '<w:p><w:r><w:t>小明</w:t></w:r></w:p>', weeksCount = 2, cellForDay } = {}) {
  const headerRow = row(['日期/姓名', ...Array.from({ length: weeksCount }, () => '第N週')]);
  const bodyRows = [];
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    const dateCells = Array.from({ length: weeksCount }, (_, i) => `<w:p><w:r><w:t>0${weekday}/0${i + 1}</w:t></w:r></w:p>`);
    const contentCells = Array.from({ length: weeksCount }, (_, i) =>
      cellForDay ? cellForDay(weekday, i + 1) : `<w:p><w:r><w:t>content-w${i + 1}-d${weekday}</w:t></w:r></w:p>`
    );
    bodyRows.push(row([weekday === 1 ? nameCellXml : '', ...dateCells]));
    bodyRows.push(row(['', ...contentCells]));
  }
  const trailingRow = row(['節氣', ...Array.from({ length: weeksCount }, () => '')]);
  return `<w:tbl>${headerRow}${bodyRows.join('')}${trailingRow}</w:tbl>`;
}

describe('splitChildTables', () => {
  it('splits one <w:tbl> per child, each into positional day cells', () => {
    const documentXml = `<w:body>${buildTableXml()}</w:body>`;
    const tables = splitChildTables(documentXml);

    expect(tables).toHaveLength(1);
    expect(tables[0].nameCellXml).toContain('小明');
    expect(tables[0].days).toHaveLength(10); // 5 weekdays x 2 weeks
  });

  it('recovers weekIndex/weekday purely from column/row-pair position', () => {
    const documentXml = `<w:body>${buildTableXml({ weeksCount: 2 })}</w:body>`;
    const [{ days }] = splitChildTables(documentXml);

    const wed2 = days.find(d => d.weekIndex === 2 && d.weekday === 3);
    expect(wed2.contentCellXml).toContain('content-w2-d3');
  });

  it('handles two children (two <w:tbl> elements) independently', () => {
    const documentXml = `<w:body>${buildTableXml({ nameCellXml: '<w:p><w:r><w:t>甲</w:t></w:r></w:p>' })}${buildTableXml({ nameCellXml: '<w:p><w:r><w:t>乙</w:t></w:r></w:p>' })}</w:body>`;
    const tables = splitChildTables(documentXml);

    expect(tables).toHaveLength(2);
    expect(tables[0].nameCellXml).toContain('甲');
    expect(tables[1].nameCellXml).toContain('乙');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t splitChildTables`
Expected: FAIL — not exported yet.

- [ ] **Step 3: Implement**

Add to `src/import/monthlyPlanDocxImport.js`:

```js
function rowCells(rowXml) {
  return [...rowXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(m => m[1]);
}

export function splitChildTables(documentXml) {
  const tables = [...documentXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(m => m[0]);

  return tables.map(tableXml => {
    const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]);
    const bodyRows = rows.slice(1, 11); // skip the week-header row; up to 5 (date,content) pairs

    const nameCellXml = bodyRows[0] ? rowCells(bodyRows[0])[0] || '' : '';
    const days = [];
    for (let pairIndex = 0; pairIndex * 2 + 1 < bodyRows.length; pairIndex += 1) {
      const weekday = pairIndex + 1;
      const dateRowCells = rowCells(bodyRows[pairIndex * 2]);
      const contentRowCells = rowCells(bodyRows[pairIndex * 2 + 1]);
      for (let col = 1; col < contentRowCells.length; col += 1) {
        days.push({
          weekIndex: col,
          weekday,
          dateCellXml: dateRowCells[col] || '',
          contentCellXml: contentRowCells[col] || '',
        });
      }
    }
    return { nameCellXml, days };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t splitChildTables`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/monthlyPlanDocxImport.js tests/monthlyPlanDocxImport.test.js
git commit -m "feat: split monthly plan document into per-child positional day cells"
```

---

### Task 5: Precise item parsing (this app's own export format)

**Files:**
- Modify: `src/import/monthlyPlanDocxImport.js`
- Test: Modify `tests/monthlyPlanDocxImport.test.js`

**Interfaces:**
- Produces: `parseExportedDayCellItems(contentCellXml)` → array of `{ indicatorCode, activityName, indicatorText, notAchieved, replaced, replacementText }`, one per `<w:p>` item paragraph in the cell. Returns `[]` for an empty/placeholder cell.

Recall the exact XML shape from `monthlyPlanDocxExport.js` (verified against a real generated blob): one item = one `<w:p>`; each of its lines (代碼/【名稱】/內容) is its own `<w:r>`, in order; `notAchieved` colors every line-run `FF0000`; `replaced` strikes every line-run; an optional trailing **unstyled** `<w:r>` in the same paragraph is `replacementText`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanDocxImport.test.js`:

```js
import { parseExportedDayCellItems } from '../src/import/monthlyPlanDocxImport.js';

function plainRun(text) {
  return `<w:r><w:t>${text}</w:t></w:r>`;
}
function styledRun(text, { color, strike } = {}) {
  const rPr = `<w:rPr>${color ? '<w:color w:val="FF0000"/>' : ''}${strike ? '<w:strike/>' : ''}</w:rPr>`;
  return `<w:r>${rPr}<w:t>${text}</w:t></w:r>`;
}

describe('parseExportedDayCellItems', () => {
  it('parses an indicator item as code/name/text with no override', () => {
    const cellXml = `<w:p>${plainRun('Ⅴ-4-3')}${plainRun('【分類遊戲】')}${plainRun('能依形狀或顏色分類')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)).toEqual([
      { indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('parses a free (no-indicator) single-line item', () => {
    const cellXml = `<w:p>${plainRun('大團體活動')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)).toEqual([
      { indicatorCode: null, activityName: '大團體活動', indicatorText: '', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('parses a tier-Ⅵ item with no activity name (code + text only, two lines)', () => {
    const cellXml = `<w:p>${plainRun('Ⅵ-1-1')}${plainRun('會手心朝下丟球或東西')}</w:p>`;
    const [item] = parseExportedDayCellItems(cellXml);
    expect(item).toMatchObject({ indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '會手心朝下丟球或東西' });
  });

  it('detects notAchieved from a colored run', () => {
    const cellXml = `<w:p>${styledRun('拼拼圖', { color: true })}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)[0]).toMatchObject({ notAchieved: true, replaced: false });
  });

  it('detects replaced + replacementText from struck runs plus a trailing plain run', () => {
    const cellXml = `<w:p>${styledRun('拼拼圖', { strike: true })}${plainRun('請假')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)[0]).toMatchObject({ activityName: '拼拼圖', replaced: true, replacementText: '請假' });
  });

  it('handles replaced with no replacementText (no trailing run at all)', () => {
    const cellXml = `<w:p>${styledRun('拼拼圖', { strike: true })}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)[0]).toMatchObject({ replaced: true, replacementText: '' });
  });

  it('preserves item order across multiple items in one cell', () => {
    const cellXml = `<w:p>${plainRun('a')}</w:p><w:p>${plainRun('b')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml).map(i => i.activityName)).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty/placeholder cell', () => {
    expect(parseExportedDayCellItems('<w:p></w:p>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t parseExportedDayCellItems`
Expected: FAIL — not exported yet.

- [ ] **Step 3: Implement**

Add to `src/import/monthlyPlanDocxImport.js`:

```js
import { normalizeIndicatorCode, getIndicator } from '../data/indicators.js';

const INDICATOR_CODE_EXACT = /^(?:[ⅠⅡⅢⅣⅤⅥ]|IⅤ|III|IV|II|I|V)-\d-\d+$/;

function extractRuns(xml) {
  return [...xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map(m => {
    const runXml = m[1];
    const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runXml)?.[1] || '';
    return {
      text: [...runXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join(''),
      hasStrike: /<w:strike\s*\/>/.test(rPr),
      hasRedColor: /<w:color\b[^>]*w:val="FF0000"/i.test(rPr),
    };
  });
}

function linesToItem(lines, flags) {
  const [first, ...rest] = lines;
  if (!INDICATOR_CODE_EXACT.test(first || '')) {
    return { indicatorCode: null, activityName: first || '', indicatorText: '', ...flags };
  }
  const indicatorCode = normalizeIndicatorCode(first);
  let activityName = '';
  let indicatorText = '';
  if (rest[0] && rest[0].startsWith('【') && rest[0].endsWith('】')) {
    activityName = rest[0].slice(1, -1);
    indicatorText = rest[1] || '';
  } else {
    indicatorText = rest[0] || '';
  }
  return { indicatorCode, activityName, indicatorText, ...flags };
}

function parseExportedItemParagraph(paragraphXml) {
  const runs = extractRuns(paragraphXml);
  if (runs.length === 0) return null;

  const hasAnyStrike = runs.some(r => r.hasStrike);
  let itemRuns = runs;
  let replacementText = '';
  if (hasAnyStrike) {
    const last = runs[runs.length - 1];
    if (!last.hasStrike) {
      replacementText = last.text;
      itemRuns = runs.slice(0, -1);
    }
  }

  const lines = itemRuns.map(r => r.text);
  const notAchieved = itemRuns.some(r => r.hasRedColor);
  const replaced = itemRuns.some(r => r.hasStrike);

  return linesToItem(lines, { notAchieved, replaced, replacementText });
}

export function parseExportedDayCellItems(contentCellXml) {
  const paragraphs = [...contentCellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(m => m[0]);
  return paragraphs.map(parseExportedItemParagraph).filter(Boolean);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t parseExportedDayCellItems`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/monthlyPlanDocxImport.js tests/monthlyPlanDocxImport.test.js
git commit -m "feat: precisely parse day-cell items from our own monthly plan export"
```

---

### Task 6: Best-effort item parsing (legacy hand-typed files)

**Files:**
- Modify: `src/import/monthlyPlanDocxImport.js`
- Test: Modify `tests/monthlyPlanDocxImport.test.js`

**Interfaces:**
- Consumes: `normalizeIndicatorCode` (Task 5's import).
- Produces: `parseLegacyDayCellItems(dateCellXml, contentCellXml)` → same item shape as Task 5's parser, but tolerant of concatenated/inconsistently-ordered legacy content and the two known 請假/更換課程 conventions found in real files (per-item strike + a following plain "請假" paragraph, OR a plain "（請假）" parenthetical appended to the date cell with no strike at all).

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanDocxImport.test.js`:

```js
import { parseLegacyDayCellItems } from '../src/import/monthlyPlanDocxImport.js';

function legacyParagraph(text, { strike = false } = {}) {
  const rPr = strike ? '<w:rPr><w:strike/></w:rPr>' : '';
  return `<w:p><w:r>${rPr}<w:t>${text}</w:t></w:r></w:p>`;
}
function legacyParagraphWithColor(text) {
  return `<w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}

describe('parseLegacyDayCellItems', () => {
  it('splits one paragraph containing a single 【name】code text item, code-first ordering', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2內容文字【換一隻手】OK');
    const [item] = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(item).toMatchObject({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手', indicatorText: '內容文字' });
  });

  it('splits one paragraph containing a single 【name】code text item, name-first ordering', () => {
    const contentCellXml = legacyParagraph('【換一隻手】Ⅲ-1-2內容文字');
    const [item] = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(item).toMatchObject({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手' });
  });

  it('splits two indicator codes concatenated in one paragraph into two items', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字一Ⅲ-2-1【打招呼】文字二');
    const items = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items.map(i => i.indicatorCode)).toEqual(['Ⅲ-1-2', 'Ⅲ-2-1']);
  });

  it('treats a paragraph with no indicator code as a free activity', () => {
    const contentCellXml = legacyParagraph('大團體活動');
    expect(parseLegacyDayCellItems('<w:p></w:p>', contentCellXml)[0]).toMatchObject({ indicatorCode: null, activityName: '大團體活動' });
  });

  it('detects notAchieved from a red-colored paragraph', () => {
    const contentCellXml = legacyParagraphWithColor('Ⅲ-1-2【換一隻手】文字');
    expect(parseLegacyDayCellItems('<w:p></w:p>', contentCellXml)[0]).toMatchObject({ notAchieved: true });
  });

  it('detects replaced via strike + a following plain "請假" paragraph', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字', { strike: true }) + legacyParagraph('請假');
    const items = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items).toHaveLength(1); // the "請假" paragraph is consumed, not its own item
    expect(items[0]).toMatchObject({ replaced: true, replacementText: '請假' });
  });

  it('detects replaced via a "（請假）" marker on the date cell, applied to every item that day', () => {
    const dateCellXml = '<w:p><w:r><w:t>01/14（請假）</w:t></w:r></w:p>';
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字一') + legacyParagraph('大團體活動');
    const items = parseLegacyDayCellItems(dateCellXml, contentCellXml);
    expect(items.every(i => i.replaced && i.replacementText === '請假')).toBe(true);
  });

  it('returns an empty array for an empty cell', () => {
    expect(parseLegacyDayCellItems('<w:p></w:p>', '<w:p></w:p>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t parseLegacyDayCellItems`
Expected: FAIL — not exported yet.

- [ ] **Step 3: Implement**

Add to `src/import/monthlyPlanDocxImport.js`:

```js
const INDICATOR_CODE_ANCHOR = /(?:[ⅠⅡⅢⅣⅤⅥ]|IⅤ|III|IV|II|I|V)-\d-\d+/g;
const ABSENT_MARKER_ON_DATE = /[（(]\s*(請假|更換課程)\s*[）)]/;
const ABSENT_REPLACEMENT_PARAGRAPH = /^(請假|更換課程)$/;

function paragraphInfo(paragraphXml) {
  const runs = extractRuns(paragraphXml);
  return {
    text: runs.map(r => r.text).join(''),
    hasStrike: runs.some(r => r.hasStrike),
    hasRedColor: runs.some(r => r.hasRedColor),
  };
}

function stripNoise(text) {
  return text.replace(/OK/gi, '').trim();
}

export function parseLegacyDayCellItems(dateCellXml, contentCellXml) {
  const dateText = [...dateCellXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
  const dateMarkerMatch = ABSENT_MARKER_ON_DATE.exec(dateText);

  const paragraphs = [...contentCellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map(m => paragraphInfo(m[0]))
    .filter(p => p.text.trim());

  const items = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs[i];
    let replacementText = '';
    const replaced = paragraph.hasStrike;

    const next = paragraphs[i + 1];
    if (paragraph.hasStrike && next && !next.hasStrike && ABSENT_REPLACEMENT_PARAGRAPH.test(next.text.trim())) {
      replacementText = next.text.trim();
      paragraphs.splice(i + 1, 1);
    }

    const notAchieved = paragraph.hasRedColor;
    const codeMatches = [...paragraph.text.matchAll(INDICATOR_CODE_ANCHOR)];

    if (codeMatches.length === 0) {
      const cleaned = stripNoise(paragraph.text);
      if (cleaned) items.push({ indicatorCode: null, activityName: cleaned, indicatorText: '', notAchieved, replaced, replacementText });
      continue;
    }

    for (let m = 0; m < codeMatches.length; m += 1) {
      const start = codeMatches[m].index;
      const end = m + 1 < codeMatches.length ? codeMatches[m + 1].index : paragraph.text.length;
      const segment = paragraph.text.slice(start, end);
      const indicatorCode = normalizeIndicatorCode(codeMatches[m][0]);
      const bracketMatch = /【([^】]*)】/.exec(segment);
      const activityName = bracketMatch ? bracketMatch[1] : '';
      const indicatorText = stripNoise(segment.replace(codeMatches[m][0], '').replace(/【[^】]*】/, ''));
      items.push({ indicatorCode, activityName, indicatorText, notAchieved, replaced, replacementText });
    }
  }

  if (dateMarkerMatch && !items.some(item => item.replaced)) {
    for (const item of items) {
      item.replaced = true;
      item.replacementText = dateMarkerMatch[1];
    }
  }

  return items;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t parseLegacyDayCellItems`
Expected: PASS. If a specific assertion (e.g. the code/name ordering split) doesn't match on the first try, adjust the regex/segment logic to make it pass — this parser is explicitly best-effort, so the exact heuristic can be tuned as long as every test above passes.

- [ ] **Step 5: Commit**

```bash
git add src/import/monthlyPlanDocxImport.js tests/monthlyPlanDocxImport.test.js
git commit -m "feat: best-effort parse day-cell items from legacy hand-typed monthly plan files"
```

---

### Task 7: Format chooser + canonical slot/override reduction

**Files:**
- Modify: `src/import/monthlyPlanDocxImport.js`
- Test: Modify `tests/monthlyPlanDocxImport.test.js`

**Interfaces:**
- Consumes: `parseExportedDayCellItems`, `parseLegacyDayCellItems` (Tasks 5-6).
- Produces:
  - `parseDayCellItems(dateCellXml, contentCellXml)` → tries the precise parser first; falls back to the legacy parser only if the precise parser found nothing.
  - `buildSlotsAndOverrides(children)` — pure function, no XML involved. `children` is `[{ name, tier, days: [{ weekIndex, weekday, items }] }]` (each `items` array from `parseDayCellItems`, still carrying that child's own notAchieved/replaced/replacementText). Returns `{ slotsByTier: Map<tierCode, [{ weekIndex, weekday, items: [{indicatorCode,activityName,indicatorText}] }]>, children: [{ name, tier, overrides: [{ weekIndex, weekday, itemIndex, notAchieved, replaced, replacementText }] }] }`. The canonical content for a tier comes from the **first** child of that tier in document order; a later same-tier child's cell is only used to compute that child's own overrides (by item index into the canonical item list), never to change canonical content, and a child whose cell has more items than canonical for that slot has its extra items silently ignored (best-effort, no warning — see design doc §四).

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanDocxImport.test.js`:

```js
import { parseDayCellItems, buildSlotsAndOverrides } from '../src/import/monthlyPlanDocxImport.js';

describe('parseDayCellItems', () => {
  it('uses the precise parser when the cell matches our own export format', () => {
    const contentCellXml = `<w:p>${plainRun('大團體活動')}</w:p>`;
    expect(parseDayCellItems('<w:p></w:p>', contentCellXml)).toEqual([
      { indicatorCode: null, activityName: '大團體活動', indicatorText: '', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('falls back to the legacy parser when the precise parser finds nothing', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字OK');
    const items = parseDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items[0]).toMatchObject({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手' });
  });

  it('returns an empty array for a genuinely empty cell (no fallback false-positive)', () => {
    expect(parseDayCellItems('<w:p></w:p>', '<w:p></w:p>')).toEqual([]);
  });
});

describe('buildSlotsAndOverrides', () => {
  const item = (over = {}) => ({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手', indicatorText: '文字', notAchieved: false, replaced: false, replacementText: '', ...over });

  it('uses the first same-tier child\'s cell as the canonical slot content', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
    ];
    const { slotsByTier } = buildSlotsAndOverrides(children);
    expect(slotsByTier.get('Ⅲ')).toEqual([
      { weekIndex: 1, weekday: 1, items: [{ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手', indicatorText: '文字' }] },
    ]);
  });

  it('records a per-child override by item index without touching canonical content', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item({ notAchieved: true })] }] },
    ];
    const { children: withOverrides } = buildSlotsAndOverrides(children);
    expect(withOverrides[0].overrides).toEqual([]);
    expect(withOverrides[1].overrides).toEqual([
      { weekIndex: 1, weekday: 1, itemIndex: 0, notAchieved: true, replaced: false, replacementText: '' },
    ]);
  });

  it('ignores a same-tier child\'s extra items beyond the canonical count, no warning/crash', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item(), item({ replaced: true })] }] },
    ];
    const { children: withOverrides } = buildSlotsAndOverrides(children);
    expect(withOverrides[1].overrides).toEqual([
      { weekIndex: 1, weekday: 1, itemIndex: 1, notAchieved: false, replaced: true, replacementText: '' },
    ]);
  });

  it('keeps different tiers independent', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅴ', days: [{ weekIndex: 1, weekday: 1, items: [item({ activityName: '不同內容' })] }] },
    ];
    const { slotsByTier } = buildSlotsAndOverrides(children);
    expect(slotsByTier.get('Ⅲ')[0].items[0].activityName).toBe('換一隻手');
    expect(slotsByTier.get('Ⅴ')[0].items[0].activityName).toBe('不同內容');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t "parseDayCellItems|buildSlotsAndOverrides"`
Expected: FAIL — not exported yet.

- [ ] **Step 3: Implement**

Add to `src/import/monthlyPlanDocxImport.js`:

```js
export function parseDayCellItems(dateCellXml, contentCellXml) {
  const precise = parseExportedDayCellItems(contentCellXml);
  if (precise.length > 0) return precise;
  return parseLegacyDayCellItems(dateCellXml, contentCellXml);
}

export function buildSlotsAndOverrides(children) {
  const canonicalByTier = new Map();
  for (const child of children) {
    if (child.tier && !canonicalByTier.has(child.tier)) canonicalByTier.set(child.tier, child);
  }

  const slotsByTier = new Map();
  for (const [tier, canonical] of canonicalByTier) {
    slotsByTier.set(
      tier,
      canonical.days.map(day => ({
        weekIndex: day.weekIndex,
        weekday: day.weekday,
        items: day.items.map(({ indicatorCode, activityName, indicatorText }) => ({ indicatorCode, activityName, indicatorText })),
      }))
    );
  }

  const childrenWithOverrides = children.map(child => {
    const overrides = [];
    for (const day of child.days) {
      day.items.forEach((item, itemIndex) => {
        if (item.notAchieved || item.replaced) {
          overrides.push({
            weekIndex: day.weekIndex,
            weekday: day.weekday,
            itemIndex,
            notAchieved: item.notAchieved,
            replaced: item.replaced,
            replacementText: item.replacementText || '',
          });
        }
      });
    }
    return { name: child.name, tier: child.tier, overrides };
  });

  return { slotsByTier, children: childrenWithOverrides };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t "parseDayCellItems|buildSlotsAndOverrides"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/monthlyPlanDocxImport.js tests/monthlyPlanDocxImport.test.js
git commit -m "feat: choose parse strategy and reduce parsed children into canonical slots+overrides"
```

---

### Task 8: Top-level orchestration `parseMonthlyPlanDocxImport`

**Files:**
- Modify: `src/import/monthlyPlanDocxImport.js`
- Test: Modify `tests/monthlyPlanDocxImport.test.js`

**Interfaces:**
- Consumes: everything from Tasks 2-7.
- Produces: `parseMonthlyPlanDocxImport(data)` (async) → `{ period: string|null, children: [{ name, tier, overrides }], slotsByTier: { [tierCode]: [{weekIndex,weekday,items}] } }, warnings: string[] }`. `data` is whatever `JSZip.loadAsync` accepts (a File/Blob from a file input, or an ArrayBuffer in tests) — same convention as `docxImport.js`'s `parseDocxImport`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanDocxImport.test.js`:

```js
import { parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';

describe('parseMonthlyPlanDocxImport', () => {
  it('assembles period, children, slotsByTier, and warns on missing/unrecognized data', async () => {
    const zip = new JSZip();
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0"?><w:hdr ${NS}><w:p><w:r><w:t>115年06月課程計畫</w:t></w:r></w:p></w:hdr>`
    );
    const nameCellXml = '<w:p><w:r><w:t>趙萬竑</w:t></w:r></w:p><w:p><w:r><w:t>24M</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>';
    const tableXml = buildTableXml({
      nameCellXml,
      weeksCount: 1,
      cellForDay: (weekday, weekIndex) =>
        weekday === 1 && weekIndex === 1 ? `<w:p>${plainRun('Ⅴ-4-3')}${plainRun('【分類遊戲】')}${plainRun('能依形狀或顏色分類')}</w:p>` : '<w:p></w:p>',
    });
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${tableXml}</w:body></w:document>`);

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseMonthlyPlanDocxImport(buffer);

    expect(parsed.period).toBe('115年06月');
    expect(parsed.children).toHaveLength(1);
    expect(parsed.children[0]).toMatchObject({ name: '趙萬竑', tier: 'Ⅴ' });
    expect(parsed.slotsByTier['Ⅴ'][0]).toMatchObject({ weekIndex: 1, weekday: 1, items: [{ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲' }] });
    expect(parsed.warnings).toEqual([]);
  });

  it('warns when the period cannot be found', async () => {
    const zip = new JSZip();
    const nameCellXml = '<w:p><w:r><w:t>某某某</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>';
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${buildTableXml({ nameCellXml, weeksCount: 1 })}</w:body></w:document>`);

    const parsed = await parseMonthlyPlanDocxImport(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(parsed.period).toBeNull();
    expect(parsed.warnings).toContain('無法從檔案中判斷課程計畫的年月，請手動選擇');
  });

  it('warns per child when name or tier cannot be determined', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${buildTableXml({ nameCellXml: '', weeksCount: 1 })}</w:body></w:document>`);

    const parsed = await parseMonthlyPlanDocxImport(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(parsed.warnings.some(w => w.includes('姓名'))).toBe(true);
    expect(parsed.warnings.some(w => w.includes('月齡階段'))).toBe(true);
  });

  it('warns when an item\'s indicator code cannot be resolved to a known indicator', async () => {
    const zip = new JSZip();
    const nameCellXml = '<w:p><w:r><w:t>某某某</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>';
    const tableXml = buildTableXml({
      nameCellXml,
      weeksCount: 1,
      cellForDay: (weekday, weekIndex) =>
        weekday === 1 && weekIndex === 1 ? `<w:p>${plainRun('Ⅴ-9-9')}${plainRun('【未知】')}${plainRun('未知指標')}</w:p>` : '<w:p></w:p>',
    });
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${tableXml}</w:body></w:document>`);

    const parsed = await parseMonthlyPlanDocxImport(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(parsed.warnings).toContain('部分指標代碼無法對應到系統內建的指標，這些項目匯入後可能無法正確顯示，建議確認後再匯入');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js -t parseMonthlyPlanDocxImport`
Expected: FAIL — not exported yet.

- [ ] **Step 3: Implement**

Add to `src/import/monthlyPlanDocxImport.js`:

```js
export async function parseMonthlyPlanDocxImport(data) {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file('word/document.xml').async('text');
  const warnings = [];

  const titleText = await extractTitleText(zip, documentXml);
  const period = parsePeriodFromTitleText(titleText);
  if (!period) warnings.push('無法從檔案中判斷課程計畫的年月，請手動選擇');

  const tables = splitChildTables(documentXml);
  const parsedChildren = tables.map(table => {
    const { name, tier } = parseChildNameCell(table.nameCellXml);
    const days = table.days.map(day => ({
      weekIndex: day.weekIndex,
      weekday: day.weekday,
      items: parseDayCellItems(day.dateCellXml, day.contentCellXml),
    }));
    return { name, tier, days };
  });

  for (const child of parsedChildren) {
    if (!child.name) warnings.push('偵測到一位無法判斷姓名的小朋友，請於預覽畫面手動確認');
    if (!child.tier) warnings.push(`無法判斷「${child.name || '（未知姓名）'}」的月齡階段，請手動選擇`);
  }

  const { slotsByTier, children: childrenWithOverrides } = buildSlotsAndOverrides(parsedChildren);

  const hasUnresolvedIndicator = [...slotsByTier.values()]
    .flat()
    .flatMap(slot => slot.items)
    .some(item => item.indicatorCode && !getIndicator(item.indicatorCode));
  if (hasUnresolvedIndicator) {
    warnings.push('部分指標代碼無法對應到系統內建的指標，這些項目匯入後可能無法正確顯示，建議確認後再匯入');
  }

  return {
    period,
    children: childrenWithOverrides,
    slotsByTier: Object.fromEntries(slotsByTier),
    warnings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanDocxImport.test.js`
Expected: PASS (whole file, all tasks so far)

- [ ] **Step 5: Commit**

```bash
git add src/import/monthlyPlanDocxImport.js tests/monthlyPlanDocxImport.test.js
git commit -m "feat: assemble parseMonthlyPlanDocxImport top-level orchestration"
```

---

### Task 9: Round-trip acceptance test

**Files:**
- Create: `tests/monthlyPlanDocxImport.acceptance.test.js`

**Interfaces:**
- Consumes: `generateMonthlyPlanDocxBlob` (`src/export/monthlyPlanDocxExport.js`), `parseMonthlyPlanDocxImport` (Task 8).

- [ ] **Step 1: Write the test**

```js
// tests/monthlyPlanDocxImport.acceptance.test.js
import { describe, it, expect } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
globalThis.Blob = NodeBlob;
import { generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';
import { parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';

describe('parseMonthlyPlanDocxImport (round-trip against our own generateMonthlyPlanDocxBlob)', () => {
  it('recovers period, two same-tier children, canonical slot content, and per-child overrides', async () => {
    const plan = { id: 1, period: '115年06月', childIds: [10, 20], childTiers: { 10: 'Ⅴ', 20: 'Ⅴ' } };
    const children = [
      { id: 10, name: '趙萬竑', birthDate: '2024-07-01' },
      { id: 20, name: '張珏銨', birthDate: '2024-07-15' },
    ];
    const slots = [
      { id: 100, planId: 1, tier: 'Ⅴ', weekIndex: 1, weekday: 1 },
      { id: 101, planId: 1, tier: 'Ⅴ', weekIndex: 1, weekday: 2 },
    ];
    const itemsBySlotId = {
      100: [
        { id: 1000, slotId: 100, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' },
        { id: 1001, slotId: 100, indicatorCode: null, activityName: '大團體活動', indicatorText: '' },
      ],
      101: [
        { id: 1010, slotId: 101, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' },
      ],
    };
    const overrides = [
      { id: 1, planId: 1, childId: 10, itemId: 1000, notAchieved: true, replaced: false, replacementText: '' },
      { id: 2, planId: 1, childId: 20, itemId: 1001, notAchieved: false, replaced: true, replacementText: '請假' },
    ];

    const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots, itemsBySlotId, overrides });
    const parsed = await parseMonthlyPlanDocxImport(blob);

    expect(parsed.period).toBe('115年06月');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.children.map(c => c.name).sort()).toEqual(['張珏銨', '趙萬竑'].sort());
    expect(parsed.children.every(c => c.tier === 'Ⅴ')).toBe(true);

    const slotAtWeekday1 = parsed.slotsByTier['Ⅴ'].find(s => s.weekIndex === 1 && s.weekday === 1);
    expect(slotAtWeekday1.items).toEqual([
      { indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' },
      { indicatorCode: null, activityName: '大團體活動', indicatorText: '' },
    ]);
    const slotAtWeekday2 = parsed.slotsByTier['Ⅴ'].find(s => s.weekIndex === 1 && s.weekday === 2);
    expect(slotAtWeekday2.items).toEqual([{ indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' }]);

    const zhaoOverrides = parsed.children.find(c => c.name === '趙萬竑').overrides;
    expect(zhaoOverrides).toEqual([{ weekIndex: 1, weekday: 1, itemIndex: 0, notAchieved: true, replaced: false, replacementText: '' }]);

    const zhangOverrides = parsed.children.find(c => c.name === '張珏銨').overrides;
    expect(zhangOverrides).toEqual([{ weekIndex: 1, weekday: 1, itemIndex: 1, notAchieved: false, replaced: true, replacementText: '請假' }]);
  });

  it('round-trips a free activity item and a tier-Ⅵ item with no activity name', async () => {
    const plan = { id: 1, period: '115年06月', childIds: [10], childTiers: { 10: 'Ⅵ' } };
    const children = [{ id: 10, name: '測試寶寶', birthDate: '2023-01-01' }];
    const slots = [{ id: 100, planId: 1, tier: 'Ⅵ', weekIndex: 1, weekday: 1 }];
    const itemsBySlotId = { 100: [{ id: 1000, slotId: 100, indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '會手心朝下丟球或東西' }] };

    const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots, itemsBySlotId, overrides: [] });
    const parsed = await parseMonthlyPlanDocxImport(blob);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.slotsByTier['Ⅵ'][0].items).toEqual([{ indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '會手心朝下丟球或東西' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails first (before assuming it will just pass)**

Run: `npx vitest run tests/monthlyPlanDocxImport.acceptance.test.js`
Expected: Likely PASS already since Tasks 1-8 are complete — but run it anyway to confirm. If it fails, the mismatch is a real bug in the parser (most likely in `parseExportedItemParagraph`'s run/paragraph boundary assumptions) — fix `src/import/monthlyPlanDocxImport.js`, not this test, unless the test itself has a typo.

- [ ] **Step 3: Run again to confirm it passes**

Run: `npx vitest run tests/monthlyPlanDocxImport.acceptance.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/monthlyPlanDocxImport.acceptance.test.js
git commit -m "test: round-trip acceptance test for monthly plan docx import"
```

---

### Task 10: Import preview screen

**Files:**
- Create: `src/ui/monthlyPlanImportPreviewView.js`
- Test: Create `tests/monthlyPlanImportPreviewView.test.js`

**Interfaces:**
- Consumes: `listChildren`, `addChild` (`src/storage/db.js`); `addMonthlyCoursePlan`, `getOrCreatePlanSlot`, `addPlanSlotItem`, `setChildItemOverride` (`src/storage/monthlyPlanDb.js`); `TIERS` (`src/data/indicators.js`); `escapeHtml` (`src/ui/escapeHtml.js`); `periodSelectsHtml`, `parsePeriod`, `currentRocYear` (`src/ui/periodFields.js`); `birthDateSelectsHtml`, `wireBirthDateSelects`, `parseBirthDateSelects` (`src/ui/birthDateField.js`).
- Produces: `renderMonthlyPlanImportPreviewView(container, { parsed, onCancel, onImported })` — same three-argument shape as `renderImportPreviewView`/`renderParentReportImportPreviewView`, so it plugs into `processImportQueue` unchanged. `parsed` is `parseMonthlyPlanDocxImport`'s return value.

Per the design doc's scope decision: this screen resolves period + per-child name-matching + tier (the things that MUST be decided before any DB write can happen), plus shows warnings and a compact per-child content summary — it does **not** reproduce a full per-cell calendar editor (that's what the existing `monthlyPlanEditorView.js` is for, immediately reachable after import).

- [ ] **Step 1: Write the failing tests**

```js
// tests/monthlyPlanImportPreviewView.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild, listChildren } from '../src/storage/db.js';
import { listMonthlyCoursePlans, listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan } from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanImportPreviewView } from '../src/ui/monthlyPlanImportPreviewView.js';
import { waitFor } from './helpers.js';

function buildParsed(overrides = {}) {
  return {
    period: '115年06月',
    warnings: [],
    slotsByTier: {
      'Ⅴ': [
        { weekIndex: 1, weekday: 1, items: [{ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' }] },
      ],
    },
    children: [{ name: '趙萬竑', tier: 'Ⅴ', overrides: [{ weekIndex: 1, weekday: 1, itemIndex: 0, notAchieved: true, replaced: false, replacementText: '' }] }],
    ...overrides,
  };
}

describe('renderMonthlyPlanImportPreviewView', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('does not persist anything until confirmed', async () => {
    const container = document.createElement('div');
    renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => {} });
    expect(await listMonthlyCoursePlans()).toEqual([]);
  });

  it('shows warnings and pre-fills the parsed period', async () => {
    const container = document.createElement('div');
    renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed({ warnings: ['測試警告'] }), onCancel: () => {}, onImported: () => {} });
    expect(container.textContent).toContain('測試警告');
    expect(container.querySelector('[data-field="period-year"]').value).toBe('115');
    expect(container.querySelector('[data-field="period-month"]').value).toBe('6');
  });

  it('auto-selects an existing child on a unique name match, creates the plan/slot/item/override on confirm', async () => {
    const existing = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    const container = document.createElement('div');
    let imported = false;
    renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    expect(container.querySelector('[data-child-select="0"]').value).toBe(existing.id);

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const plans = await listMonthlyCoursePlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].childIds).toEqual([existing.id]);
    expect(plans[0].childTiers[existing.id]).toBe('Ⅴ');
    expect((await listChildren())).toHaveLength(1); // no duplicate child created

    const [slot] = await listPlanSlotsForPlan(plans[0].id);
    expect(slot).toMatchObject({ tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    const [item] = await listPlanSlotItems(slot.id);
    expect(item).toMatchObject({ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲' });

    const [override] = await listChildItemOverridesForPlan(plans[0].id);
    expect(override).toMatchObject({ childId: existing.id, itemId: item.id, notAchieved: true, replaced: false });
  });

  it('requires a manual pick when there is no existing child with that name, "建立新小朋友" creates one', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    expect(container.querySelector('[data-child-select="0"]').value).toBe('__new__');
    container.querySelector('[data-child-new-name="0"]').value = '趙萬竑';
    const birthYear = container.querySelector('[data-child-new-birthDate-year="0"]');
    const birthMonth = container.querySelector('[data-child-new-birthDate-month="0"]');
    const birthDay = container.querySelector('[data-child-new-birthDate-day="0"]');
    birthYear.value = '2024';
    birthMonth.value = '7';
    birthDay.value = '1';

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const created = await listChildren();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: '趙萬竑', birthDate: '2024-07-01' });
  });

  it('unchecking a child excludes them from the created plan entirely', async () => {
    await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    const container = document.createElement('div');
    let imported = false;
    renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-child-include="0"]').checked = false;
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const plans = await listMonthlyCoursePlans();
    expect(plans[0].childIds).toEqual([]);
  });

  it('calls onCancel without persisting anything', async () => {
    const container = document.createElement('div');
    const onCancel = vi.fn();
    renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel, onImported: () => {} });
    container.querySelector('[data-action="cancel"]').click();
    expect(onCancel).toHaveBeenCalled();
    expect(await listMonthlyCoursePlans()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/monthlyPlanImportPreviewView.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement**

```js
// src/ui/monthlyPlanImportPreviewView.js
import { addChild, listChildren } from '../storage/db.js';
import { addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride } from '../storage/monthlyPlanDb.js';
import { TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml, parsePeriod } from './periodFields.js';
import { birthDateSelectsHtml, wireBirthDateSelects, parseBirthDateSelects } from './birthDateField.js';

const NEW_CHILD_VALUE = '__new__';

function childBlock(parsedChild, index, existingChildren) {
  const nameMatches = parsedChild.name ? existingChildren.filter(c => c.name === parsedChild.name) : [];
  const preselected = nameMatches.length === 1 ? nameMatches[0].id : NEW_CHILD_VALUE;
  const itemCount = parsedChild.overrides.length;

  return `
    <fieldset class="panel-form__field import-preview__child" data-child-block="${index}">
      <legend>
        <label><input type="checkbox" data-child-include="${index}" checked> ${escapeHtml(parsedChild.name || '（未知姓名）')}</label>
      </legend>
      <label class="panel-form__field">
        比對小朋友
        <select data-child-select="${index}">
          <option value="${NEW_CHILD_VALUE}" ${preselected === NEW_CHILD_VALUE ? 'selected' : ''}>建立新小朋友</option>
          ${existingChildren
            .map(c => `<option value="${escapeHtml(c.id)}" ${preselected === c.id ? 'selected' : ''}>${escapeHtml(c.name)}（${escapeHtml(c.birthDate)}）</option>`)
            .join('')}
        </select>
      </label>
      <div class="import-preview__new-child" data-child-new-fields="${index}" ${preselected === NEW_CHILD_VALUE ? '' : 'hidden'}>
        <label class="panel-form__field">姓名 <input data-child-new-name="${index}" value="${escapeHtml(parsedChild.name ?? '')}"></label>
        <label class="panel-form__field">
          出生日期
          ${birthDateSelectsHtml({
            yearFieldName: `child-new-birthDate-year-${index}`,
            monthFieldName: `child-new-birthDate-month-${index}`,
            dayFieldName: `child-new-birthDate-day-${index}`,
          })}
        </label>
      </div>
      <label class="panel-form__field">
        月齡階段
        <select data-child-tier="${index}">
          ${TIERS.map(t => `<option value="${t.code}" ${t.code === parsedChild.tier ? 'selected' : ''}>${t.code}（${t.label}）</option>`).join('')}
        </select>
      </label>
      <p class="import-preview__entry-note">共 ${itemCount} 項標記為未達成／請假／更換課程</p>
    </fieldset>
  `;
}

export function renderMonthlyPlanImportPreviewView(container, { parsed, onCancel, onImported }) {
  return renderAsync(container, { parsed, onCancel, onImported });
}

async function renderAsync(container, { parsed, onCancel, onImported }) {
  const existingChildren = await listChildren();
  const defaultRocYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;
  const { year: parsedYear, month: parsedMonth } = parsePeriod(parsed.period);

  container.innerHTML = `
    <div class="page-header">
      <button type="button" class="btn btn--ghost" data-action="cancel">← 取消匯入</button>
      <h2 class="page-header__title">確認匯入內容（課程月計畫）</h2>
    </div>
    ${
      parsed.warnings.length > 0
        ? `<ul class="import-preview__warnings">${parsed.warnings.map(w => `<li class="field-error">${escapeHtml(w)}</li>`).join('')}</ul>`
        : ''
    }
    <form class="panel-form" data-action="confirm-import">
      <h3 class="panel-form__title">年月</h3>
      ${periodSelectsHtml({
        yearFieldName: 'period-year',
        monthFieldName: 'period-month',
        selectedYear: parsedYear ?? defaultRocYear,
        selectedMonth: parsedMonth ?? defaultMonth,
      })}

      <h3 class="panel-form__title">小朋友（共 ${parsed.children.length} 位）</h3>
      ${parsed.children.map((c, i) => childBlock(c, i, existingChildren)).join('') || '<p>沒有偵測到任何小朋友</p>'}

      <button type="submit" class="btn btn--primary">確認匯入</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-action="cancel"]').addEventListener('click', onCancel);

  parsed.children.forEach((_, index) => {
    wireBirthDateSelects(container, {
      yearFieldName: `child-new-birthDate-year-${index}`,
      monthFieldName: `child-new-birthDate-month-${index}`,
      dayFieldName: `child-new-birthDate-day-${index}`,
    });
    container.querySelector(`[data-child-select="${index}"]`).addEventListener('change', event => {
      container.querySelector(`[data-child-new-fields="${index}"]`).hidden = event.target.value !== NEW_CHILD_VALUE;
    });
  });

  container.querySelector('[data-action="confirm-import"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-error]');

    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;

    const includedIndexes = parsed.children
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-child-include="${i}"]`).checked);

    try {
      const resolvedChildren = [];
      for (const index of includedIndexes) {
        const select = container.querySelector(`[data-child-select="${index}"]`);
        const tier = container.querySelector(`[data-child-tier="${index}"]`).value;
        let child;
        if (select.value === NEW_CHILD_VALUE) {
          const name = container.querySelector(`[data-child-new-name="${index}"]`).value;
          const birthDate = parseBirthDateSelects(container, {
            yearFieldName: `child-new-birthDate-year-${index}`,
            monthFieldName: `child-new-birthDate-month-${index}`,
            dayFieldName: `child-new-birthDate-day-${index}`,
          });
          if (!name || !birthDate) throw new Error('請完整填寫新小朋友的姓名與出生日期');
          child = await addChild({ name, birthDate });
        } else {
          child = existingChildren.find(c => c.id === select.value);
        }
        resolvedChildren.push({ child, tier, overrides: parsed.children[index].overrides });
      }

      const childIds = resolvedChildren.map(rc => rc.child.id);
      const childTiers = Object.fromEntries(resolvedChildren.map(rc => [rc.child.id, rc.tier]));
      const plan = await addMonthlyCoursePlan({ period, childIds, childTiers });

      const tiersUsed = [...new Set(resolvedChildren.map(rc => rc.tier))];
      const itemIdsBySlotKey = new Map();
      for (const tier of tiersUsed) {
        for (const slot of parsed.slotsByTier[tier] || []) {
          const createdSlot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: slot.weekIndex, weekday: slot.weekday });
          const itemIds = [];
          for (const item of slot.items) {
            const created = await addPlanSlotItem({ slotId: createdSlot.id, indicatorCode: item.indicatorCode, activityName: item.activityName, indicatorText: item.indicatorText });
            itemIds.push(created.id);
          }
          itemIdsBySlotKey.set(`${tier}:${slot.weekIndex}:${slot.weekday}`, itemIds);
        }
      }

      for (const rc of resolvedChildren) {
        for (const override of rc.overrides) {
          const itemIds = itemIdsBySlotKey.get(`${rc.tier}:${override.weekIndex}:${override.weekday}`);
          const itemId = itemIds && itemIds[override.itemIndex];
          if (!itemId) continue;
          await setChildItemOverride({
            planId: plan.id,
            childId: rc.child.id,
            itemId,
            notAchieved: override.notAchieved,
            replaced: override.replaced,
            replacementText: override.replacementText,
          });
        }
      }

      onImported();
    } catch (err) {
      errorEl.textContent = `匯入失敗，請再試一次（${err?.message || err}）`;
    }
  });
}
```

Check `src/ui/birthDateField.js` for the exact `birthDateSelectsHtml`/`wireBirthDateSelects`/`parseBirthDateSelects` signatures before wiring this up (used already by `childListView.js` — mirror that usage exactly).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanImportPreviewView.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/monthlyPlanImportPreviewView.js tests/monthlyPlanImportPreviewView.test.js
git commit -m "feat: monthly plan import preview/confirm screen"
```

---

### Task 11: Wire the import button into `monthlyPlanListView.js`

**Files:**
- Modify: `src/ui/monthlyPlanListView.js`
- Modify: `tests/monthlyPlanListView.test.js`

**Interfaces:**
- Consumes: `processImportQueue` (Task 1), `parseMonthlyPlanDocxImport` (Task 8), `renderMonthlyPlanImportPreviewView` (Task 10).

- [ ] **Step 1: Write the failing test**

Add to `tests/monthlyPlanListView.test.js`:

```js
import { parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';

it('imports a docx file via the import button and file input', async () => {
  await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn() });

  const button = container.querySelector('[data-action="import-monthly-plan-docx"]');
  const fileInput = container.querySelector('[data-field="import-monthly-plan-file"]');
  expect(button).toBeTruthy();
  expect(fileInput).toBeTruthy();
  expect(fileInput.multiple).toBe(true);

  // A real file-picker interaction can't be simulated in jsdom; this test only asserts the
  // control exists and click() delegates to the hidden file input, matching childListView's
  // existing import-button test convention.
  const clickSpy = vi.spyOn(fileInput, 'click');
  button.click();
  expect(clickSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/monthlyPlanListView.test.js -t "imports a docx file"`
Expected: FAIL — no import button exists yet.

- [ ] **Step 3: Implement**

In `src/ui/monthlyPlanListView.js`, add these imports:

```js
import { processImportQueue } from './importQueue.js';
import { parseMonthlyPlanDocxImport } from '../import/monthlyPlanDocxImport.js';
import { renderMonthlyPlanImportPreviewView } from './monthlyPlanImportPreviewView.js';
```

Change the page header markup to add the import button/input and an error slot (mirroring `childListView.js`'s pattern):

```js
  container.innerHTML = `
    <div class="page-header page-header--editor">
      ${onBack ? '<button type="button" class="btn btn--ghost" data-action="back">← 返回選擇表單</button>' : ''}
      <h2 class="page-header__title">課程月計畫</h2>
      <button type="button" class="btn btn--purple" data-action="import-monthly-plan-docx">課程月計畫匯入</button>
      <input type="file" accept=".docx" data-field="import-monthly-plan-file" multiple hidden>
    </div>
    <p class="field-error field-error--center" data-error="import"></p>
    <div class="tab-layout">
```

(keep everything else in the template the same — just insert the button/input into the header and add the warning paragraph right after it, before `<div class="tab-layout">`).

At the end of the function, alongside the other event wiring, add:

```js
  const importFileInput = container.querySelector('[data-field="import-monthly-plan-file"]');
  container.querySelector('[data-action="import-monthly-plan-docx"]').addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', async () => {
    if (importFileInput.files.length === 0) return;
    await processImportQueue(importFileInput.files, {
      parseFn: parseMonthlyPlanDocxImport,
      renderPreview: renderMonthlyPlanImportPreviewView,
      container,
      backToList: () => renderMonthlyPlanListView(container, { onSelectPlan, onBack, confirmDelete }),
    });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/monthlyPlanListView.test.js`
Expected: PASS (all tests in the file, including the pre-existing ones — confirm no regression)

- [ ] **Step 5: Commit**

```bash
git add src/ui/monthlyPlanListView.js tests/monthlyPlanListView.test.js
git commit -m "feat: wire monthly plan docx import into the plan list view"
```

---

### Task 12: Full suite check + manual verification against real reference files

**Files:** none (verification only — no committed changes besides what's noted in Step 4)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run tests/`
Expected: PASS, no regressions in any other test file (the CLAUDE.md note about a stale worktree copy doubling test counts applies here — always scope to `tests/`, never the bare `npm test`, when checking the count).

- [ ] **Step 2: Manually import each real reference file and eyeball the parsed result**

This step touches real gitignored data (`references/月計畫/*.docx`) — do not commit anything containing their content, and do not paste real child names/content into commit messages or code comments.

Write a throwaway script (not committed) at, e.g., a scratch path outside the repo or in an already-gitignored location, such as `references/inspect-import.mjs`:

```js
// references/inspect-import.mjs (gitignored directory — do not move this file elsewhere)
import { readFile } from 'node:fs/promises';
import { parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';

const files = [
  'references/月計畫/西瓜班-01月計畫 .docx',
  'references/月計畫/西瓜班-02月計畫 .docx',
  'references/月計畫/西瓜班-10月計畫.docx',
  'references/月計畫/西瓜班-12月計畫.docx',
  'references/月計畫/115年06月週計畫表.docx',
];

for (const file of files) {
  const buffer = await readFile(file);
  const parsed = await parseMonthlyPlanDocxImport(buffer);
  console.log('---', file, '---');
  console.log('period:', parsed.period);
  console.log('children:', parsed.children.map(c => ({ tier: c.tier, overrideCount: c.overrides.length })));
  console.log('warnings:', parsed.warnings);
  console.log('slot count per tier:', Object.fromEntries(Object.entries(parsed.slotsByTier).map(([t, s]) => [t, s.length])));
}
```

Run: `node references/inspect-import.mjs`

Check per the design doc's acceptance criteria (§驗收方式):
- Period is recovered for every file (or a clear warning if not).
- Every child gets a name and tier, or a clear per-child warning.
- At least some items in `slotsByTier` have a real `indicatorCode` (not all `null`) — confirms the legacy indicator-code splitting is finding real codes, not just falling through to "free activity" for everything.
- No thrown exceptions for any of the 5 files.

If a file produces zero useful output (e.g. `children` empty, or every item has `indicatorCode: null` when the source clearly has indicator codes in it), go back and adjust the relevant Task 3/4/6 regex — this is expected iteration against real-world formatting, not a sign the design is wrong.

- [ ] **Step 3: Delete the throwaway script**

```bash
rm references/inspect-import.mjs
```

(`references/` is gitignored, so this was never at risk of being committed, but clean up anyway.)

- [ ] **Step 4: Final commit if any parser adjustments were made in Step 2**

```bash
git add src/import/monthlyPlanDocxImport.js
git commit -m "fix: tune legacy monthly plan parsing heuristics against real reference files"
```

(Skip this commit if Step 2 required no code changes.)
