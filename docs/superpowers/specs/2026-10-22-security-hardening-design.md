# 上線前安全修補

來源：2026-10-22 上線前安全檢查。密碼閘門不在本次範圍（之後不一定沿用）。

## 問題與修法

1. **同步收進偽造的 `id`**：`deserializeRecord` 把雲端紀錄裡除了外鍵以外的欄位全部照抄，包括 `id`（`serializeRecord` 上傳時明明已經拿掉）。新紀錄 `objectStore.add` 時就用了那個字串當主鍵。字串 `id` 會被放進月計畫面板的屬性（沒有跳脫 → 可執行程式碼），也會放進各畫面的 `querySelector`（含引號 → 整個畫面打不開）。
   - 修法：`deserializeRecord` 略過 `id`。本機 `id` 一律由 IndexedDB 自動編號。
   - 加一層保險：`panelItemRowHtml` 的 `item.id` 也經過 `escapeHtml`。
2. **總表狀態欄沒有跳脫**：`formEditorView.js` 的 `entry-row__mark--${entry.status}`。備份檔或雲端同步進來的 `status` 可以是任意字串。
   - 修法：跟其他欄位一樣經過 `escapeHtml`。這是畫面輸出端，不論資料從哪裡來都擋得住。
3. **備份匯入先清空才發現檔案壞了**：讀檔、解析 JSON、版本檢查都在清空前，但「形狀」不對（缺少必要清單、該是陣列的欄位不是陣列、照片內容空白或不是 base64）要到清空後寫入時才會出錯，舊資料就沒了。
   - 修法：`importParsedBackup` 在 `clearAllData()` 前跑 `validateBackupShape(data)`。只檢查會讓匯入中途出錯的形狀問題，**不**檢查外鍵是否對得上（現有匯入對懸空外鍵是容忍的，檢查它會讓原本能還原的舊備份被擋下）。錯誤訊息用中文並說明「目前資料沒有被動到」。
4. **網頁安全政策**：`script-src` 有 `'unsafe-inline'`，等於只要任何地方漏跳脫，插入的程式就能執行。兩個版本的頁面內程式只有一段，且沒有任何 `onclick=` 之類的行內事件，改成該段程式的 `sha256` 雜湊。網頁版保留 `https://accounts.google.com`（Google 登入）。`style-src 'unsafe-inline'` 不動（大量動態 style）。
5. **開發工具套件漏洞**：vitest / esbuild 升到沒有已知漏洞的版本；不影響網頁內容，只影響建置環境。

## 不做

- 匯入時全面驗證每個欄位的值域（tier、period…）：渲染端已跳脫，且過嚴會拒絕舊備份。
- 密碼閘門。
