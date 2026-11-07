# 管理幼兒排順序樣式調整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依示意圖 A 調整「管理幼兒」的排順序按鈕與排序畫面樣式；排序畫面單欄、點過的排在上面。

**Architecture:** 只改 `src/ui/monthlyPlanEditorView.js` 的排序畫面 HTML／`renderSortList` 與 `src/styles.css` 的 `.child-order__*`。邏輯沿用 `src/domain/childOrder.js`。

**Tech Stack:** vanilla JS、vitest + jsdom、Playwright 截圖。

**Spec:** `docs/superpowers/specs/2026-11-07-monthly-plan-child-order-restyle-design.md`

## Global Constraints

- 文字：按鈕「⇅ 排順序」；排序畫面標題「排順序」、說明「依序點選幼兒」。數字用 1、2、3（不用 ①）。
- 主按鈕在左、取消在右（現狀，不動）。
- 完成／取消／儲存／關掉視窗的行為不變；既有測試全部要過。

## Review Focus

- 點擊後清單重排：下一個要點的小朋友位置會變，但 `data-sort-child` 事件仍要點中正確的人 → Task 1 測試。
- 取消號碼的小朋友回到「沒點」區，位置照原順序 → Task 1 測試。

---

### Task 1: 排序畫面單欄、點過的在上 + 樣式

**Files:**
- Modify: `src/ui/monthlyPlanEditorView.js`（排序畫面 HTML、`renderSortList`、`tapNumber`）
- Modify: `src/styles.css`（`.child-order__*` 區塊）
- Test: `tests/monthlyPlanEditorView.test.js`（`describe('monthlyPlanEditorView: child order')`）

- [ ] **Step 1: 寫失敗測試**
  - 「點過的移到上面、照點的先後」：`open([A,B,C])` → 排順序 → 點 C、再點 B → `[data-sort-child]` 順序為 `[C,B,A]`，C 的 `[data-sort-number]` 為 `'1'`、B 為 `'2'`、A 為 `''`。
  - 「取消號碼回到原位置」：接著再點 C → 順序 `[B,A,C]`，B 的號碼 `'1'`。
  - 既有「tapping a numbered child again…」測試把期望 `'①'` 改成 `'1'`。
  - 「說明只剩一句」：`q('[data-sort-children] .child-order__hint').textContent.trim()` 為 `'依序點選幼兒'`；標題為 `'排順序'`。
- [ ] **Step 2:** `npx vitest run tests/monthlyPlanEditorView.test.js` → 新測試 FAIL
- [ ] **Step 3:** `renderSortList` 改用 `applyTapOrder(finalChildIds(childOrder, checked), tapped)` 的順序；號碼 `String(n)`（刪 `tapNumber`）；清單容器用 `.child-order__list`（單欄，不再用 `panel-form__checkbox-list`），每列 `.child-order__item`（不再用 `panel-form__checkbox`）。標題／說明文字照 Global Constraints；排順序按鈕 class 改 `btn btn--small child-order__sort-button`，文字「⇅ 排順序」。CSS：按鈕 `--brand-tint` 底、`--brand-dark` 字、無框；legend 那行 flex 置中對齊；說明置中灰字；列約 44px、圓 24px，點過實心 `--brand` 圓白字＋淡藍底藍框，沒點虛線灰圓＋白底灰框。
- [ ] **Step 4:** `npx vitest run tests/` → 全部 PASS
- [ ] **Step 5:** `npm run build`，Playwright 截電腦 1280px 與手機 390px 的打勾／排序畫面，和示意圖比對。
- [ ] **Step 6:** `git commit -m "style(月計畫): 管理幼兒排順序改成單欄、點過的排在上面"`
