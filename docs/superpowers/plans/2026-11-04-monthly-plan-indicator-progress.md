# 月計畫指標達成狀況 — 實作計畫

Spec: `docs/superpowers/specs/2026-11-04-monthly-plan-indicator-progress-design.md`

1. **`src/domain/indicatorProgress.js` + `tests/indicatorProgress.test.js`**（TDD）
   - `progressFromStatuses(statuses)` → `'achieved' | 'developing' | 'none'`
   - `loadIndicatorProgress(childIds)` → `Map<childId, Map<code, 'achieved'|'developing'>>`，讀 `listFormsForChild`/`listEntriesForForm` 與 `listParentReportsForChild`/`listCoursePlanEntriesForReport`/`listCourseOccurrencesForEntry`；請假／更換課程略過。
2. **`src/ui/monthlyPlanEditorView.js`**（TDD，`tests/monthlyPlanEditorView.test.js`）
   - `loadEditorData` 加 `progress`
   - `indicatorOptionsHtml(tier, childProgress)`：圓點前綴 + `indicator-option--<state>` class
   - 選單上方說明列 `[data-indicator-legend]`、下方名單 `[data-indicator-roster]`，在 select 的 change 時更新
3. **`src/styles.css`**：三種選項底色、說明列與名單樣式
4. **`src/ui/helpContent.js`**：月計畫新增項目示範的指標欄加圓點與說明列
5. 驗證：`npx vitest run tests/`、`npm run build`、Playwright 開 `dist/TableC.html` 實際操作
