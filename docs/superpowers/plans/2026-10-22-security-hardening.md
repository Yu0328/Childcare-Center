# 上線前安全修補：實作計畫

規格：`docs/superpowers/specs/2026-10-22-security-hardening-design.md`

1. `tests/syncStores.test.js`：`deserializeRecord` 不帶出 payload 的 `id` → 改 `src/sync/syncStores.js`。
2. `tests/formEditorView.test.js`：狀態含 HTML 時不產生額外元素 → 改 `src/ui/formEditorView.js`（`escapeHtml(entry.status)`）。
3. `src/ui/monthlyPlanEditorView.js`：`panelItemRowHtml` 的 `item.id` 加 `escapeHtml`（保險，根因已在 1 修掉）。
4. `tests/backup.test.js`：各種形狀錯誤的備份都被拒絕且舊資料仍在 → 改 `src/storage/backup.js`（`validateBackupShape`）。
5. `scripts/build.mjs`、`scripts/build-web.mjs`：`script-src` 改為行內程式的 sha256；建置後用 Playwright 開 `dist/TableC.html` 與 `site/index.html` 確認沒有 CSP 錯誤、畫面正常。
6. 升級 vitest / esbuild，`npm audit` 為 0，`npx vitest run tests/` 全過。
