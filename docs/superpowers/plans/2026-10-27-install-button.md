# 「加入主畫面」按鈕 — 實作計畫

Spec: `docs/superpowers/specs/2026-10-27-install-button-design.md`

1. **`src/pwa/installPrompt.js`**（TDD，`tests/installPrompt.test.js`）
   - `createInstall({ win, nav })`：一建立就聽 `beforeinstallprompt`（`preventDefault` 並存起來）與 `appinstalled`。
   - `kind()` 依 spec 表格回傳 `'line' | 'ios' | 'prompt' | null`。
   - `wireButton(button, mode)`：依 `kind()` 設 `hidden`，之後事件觸發時更新；點擊開說明視窗。
2. **`src/ui/installDialog.js`**：`openInstallDialog({ kind, mode, onPhone, store, onInstall, lineUrl })`，沿用 `formPopup` 的 `<dialog>` 做法；`ios` 用 `mountDemo` 播 `INSTALL_IPHONE_DEMO`。
3. **`src/ui/syncHeader.js`**：兩種模式都加 `<button data-action="install" hidden>`（`headerButtonLabel('加入主畫面', '安裝')`），位置照 spec。`wireSyncControls` 接 `wireInstall(button, mode)`，比照 `wireBackup` 每次重畫都重接。
4. **`scripts/build-web.mjs`**：開頭 `const install = CFormApp.createInstall()`，傳 `wireInstall`；加 `apple-mobile-web-app-title`。`webEntry.js` 匯出 `createInstall`。
5. **`src/ui/helpContent.js`**：更新三個安裝 demo，匯出 iPhone demo；`helpContent.test.js` 跟著改。
6. `npm test`、`npm run build:web`、Playwright 檢查 iPhone UA 與 prompt 兩種情況的視窗。
