# 月計畫 Word 每位幼兒從新的一頁開始 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 月計畫匯出時第二位幼兒起每張表都從新頁開始。
**Architecture:** 在 `generateMonthlyPlanDocxBlob` 把「每張表後的空白段落」換成「第二張表起每張表前一個 `pageBreakBefore`、約 1pt 高的段落」。
**Tech Stack:** `docx` npm、vitest。
**Spec:** `docs/superpowers/specs/2026-11-04-monthly-plan-page-per-child-design.md`

## Global Constraints
- 用 `pageBreakBefore`，不用手動分頁符號（避免整頁滿時多一張空白頁）。
- 不切多節、不在表格第一格設屬性。

---

### Task 1: 表前分頁段落

**Files:**
- Modify: `src/export/monthlyPlanDocxExport.js`（`generateMonthlyPlanDocxBlob`）
- Test: `tests/monthlyPlanDocxExport.test.js`

- [ ] **Step 1: 寫失敗測試**（加在 `describe('generateMonthlyPlanDocxBlob')` 內）

```js
it('第二位幼兒起每張表都從新的一頁開始，第一張表前沒有分頁', async () => {
  const plan = { id: 1, period: '115年06月', childIds: [10, 11, 12], childTiers: { 10: 'Ⅴ', 11: 'Ⅴ', 12: 'Ⅴ' } };
  const children = [10, 11, 12].map(id => ({ id, name: `幼兒${id}`, birthDate: '2024-07-01' }));
  const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots: [], itemsBySlotId: {}, overrides: [] });
  const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
  const body = await zip.file('word/document.xml').async('text');
  const [beforeFirst, ...rest] = body.split('<w:tbl>');
  expect(beforeFirst).not.toContain('<w:pageBreakBefore/>');
  expect(rest).toHaveLength(3);
  // 每張表結束到下一張表開始之間有分頁段落
  for (const chunk of rest.slice(0, -1)) expect(chunk.split('</w:tbl>').pop()).toContain('<w:pageBreakBefore/>');
  expect(rest.at(-1).split('</w:tbl>').pop()).not.toContain('<w:pageBreakBefore/>');
});
```

- [ ] **Step 2:** `npx vitest run tests/monthlyPlanDocxExport.test.js` → FAIL（沒有 pageBreakBefore）。

- [ ] **Step 3: 實作**

```js
// 第二位幼兒起每張表前放一個「從新頁開始」的段落（不用手動分頁符號：上一張表剛好滿頁時
// 那會多出一張空白頁）；壓到約 1pt 高，新頁頂端看不出多一行。
function pageBreakParagraph() {
  return new Paragraph({
    pageBreakBefore: true,
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text: '', size: 2 })],
  });
}
// generateMonthlyPlanDocxBlob 內：
const tables = children_.flatMap((child, index) => [
  ...(index > 0 ? [pageBreakParagraph()] : []),
  buildChildTable(child, plan.childTiers[child.id], weeks, slots, itemsBySlotId, overrides),
]);
```
`LineRuleType` 加進 `docx` import。Word 要求表格後必須有段落，`docx` 會自動補最後一個段落（確認 Step 4 的 XML 結尾 `</w:tbl>` 後有 `<w:p`，沒有就在最後補 `emptyParagraph()`）。

- [ ] **Step 4:** `npx vitest run tests/` → 全部 PASS。

- [ ] **Step 5: 往返檢查** — 用兩位幼兒的計畫匯出後，再以 `parseMonthlyPlanDocx`（`src/import/monthlyPlanDocxImport.js`）匯入，比對兩位幼兒都在、項目一致。

- [ ] **Step 6: Commit** `feat: 月計畫 Word 每位幼兒從新的一頁開始`
