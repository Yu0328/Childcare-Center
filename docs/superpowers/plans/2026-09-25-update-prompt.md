# 新版本改成「提示更新」— 實作計畫

設計見 `docs/superpowers/specs/2026-09-25-update-prompt-design.md`。

1. 新增 `tests/updatePrompt.test.js`（用假的 serviceWorker／registration 物件）：已有舊版且有等待中的新版時顯示提示條；第一次安裝不顯示；`updatefound` 裝好後顯示；按更新傳出 `'SKIP_WAITING'`；只有按過更新，`controllerchange` 才重新整理。
2. 實作 `src/pwa/updatePrompt.js`，從 `src/webEntry.js` 匯出；`styles.css` 加提示條樣式。
3. `scripts/build-web.mjs`：`sw.js` 拿掉 `install` 裡的 `skipWaiting()`，加上 `message` 監聽；頁面的註冊程式改呼叫 `CFormApp.wireUpdatePrompt`。
4. 跑全部測試；用 Playwright 在本機伺服器上實測：載入 → 重建出不同版本 → 確認出現提示條、沒有自動重新整理 → 按更新 → 確認重新整理且提示條消失。
