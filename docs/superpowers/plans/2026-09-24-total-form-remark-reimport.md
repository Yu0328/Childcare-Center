# 總表 備註 與紅字狀態的匯入還原 — 實作計畫

設計見 `docs/superpowers/specs/2026-09-24-total-form-remark-reimport-design.md`。

1. **匯入器回傳 `status`**：`tests/docxImport.test.js` 先把 `achieved` 的斷言改成 `status`，並新增兩個測試：「請假」列（還原前綴後的說明）和「更換課程」列。接著修改 `parseBodyRows`／`resolveEntryDates`。
2. **匯入器讀取備註區**：用匯出器 `generateDocxBlob` 產生含備註的檔案，再用 `parseDocxImport` 讀回來，確認以下幾點：
   - 會回傳 `isRemark` 資料，且不帶 `tier`；
   - 自訂文字的標籤會存成 `activityName`；
   - 沒有日期的備註也要讀得到；
   - 空白占位列要略過；
   - 備註不會觸發對應不到的警告。
3. **匯入預覽**：`tests/importPreviewView.test.js` 驗證四件事：
   - 紅字狀態的顯示；
   - 存檔寫入 `status`；
   - 備註列存進同一份總表；
   - 備註列帶上 `activityName`。
4. **備註去重**：`tests/formEditorView.test.js` 驗證上一階段的資料和本份的備註相同時只出現一次。
5. **來回驗證**：用真實範例檔做匯入 → 匯出 → 再匯入 → 再匯出，逐欄比對兩次匯出的內容。另外做一份包含備註和紅字狀態的總表，驗證同樣的流程。
