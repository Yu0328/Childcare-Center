# 介面美觀調整 — 實作計畫

設計見 `docs/superpowers/specs/2026-09-24-ui-visual-polish-design.md`。

1. 動手前先拍改前截圖：手機和電腦版的首頁、總表列表、總表內容、適性紀錄課程計畫表、月計畫，都用真實資料。
2. 日期與標記（B、C）：`formEditorView`／`courseplanTabView`／兩個匯入預覽改用 `toRocDate`，並加上狀態樣式。測試：總表日期顯示成 `○115/01/07`、`△115/01/08`，並帶有對應的樣式。
3. 總表列表（G）：顯示紀錄筆數，同期間依階段排序。測試：筆數、排序。
4. 標題列（A）：兩種版本的備份按鈕都收進選單。測試：訪客模式選單和登入按鈕在同一行；按下匯出或點選單外，選單會收起。
5. 其餘 D、E、F、H、I 只改樣式（F 的標題多一個期間的 span）。
6. 跑全部測試，重新建置兩種版本，拍改後截圖逐項對照，再跑全畫面走查確認沒有超出畫面或被裁切。

## 第二輪

7. J：新增 `src/ui/rowClickEdit.js` 與測試（點列會觸發該列自己的編輯按鈕；點按鈕／輸入欄位／編輯表單內不觸發；巢狀以最內層為準）。五個畫面的可點範圍與編輯按鈕加上標記並呼叫它；CSS 把 `[data-row-edit]` 藏起來（鍵盤移到時才出現），可點範圍加手指游標與滑過變色。
8. K：`monthlyPlanEditorView` 加幼兒切換列，未選中的 `.monthly-calendar` 設為 hidden，選擇記在模組內的 Map（依計畫 id）。測試：切換後只顯示那位；重新整理後仍是同一位。
9. L：`.entry-form__checkbox input`／`.entry-form__radio input` 加 `flex: none`；兩個 `statusRadios` 的 ○△ 改用 `entry-row__mark` 樣式放前面。
10. 跑全部測試、建置、拍前後對照、走查。

## 第三輪

11. N：`.panel-form__checkbox-row input` 加 `flex: none`，勾選清單手機改單欄。
12. O–S：行為觀察／點滴分享表單加 `panel-form--wide`；`parentReportEditorView` 分頁容器先放 `.view-loading` 的「載入中…」；點滴分享卡片說明移到最前、清單加間距；備註卡片日期的上下距縮小；電腦版 `.page-header` 改三欄格線。
13. 跑全部測試、建置、拍前後對照、走查；沒問題就合併到 main、部署、刪除分支。
