# 月計畫 Word：每位幼兒從新的一頁開始

## 問題

月計畫匯出（`src/export/monthlyPlanDocxExport.js`）每位幼兒一張表，表與表之間只隔一個空白段落，
所以下一位幼兒常接在上一位的後半頁開始，印出來一張紙上混兩位幼兒。

## 要的行為

- 每位幼兒的表格都從新的一頁開始。
- 一位幼兒的表格超過一頁（例如一頁半），下一位從再下一頁開始，不接在那半頁後面。
- 跨頁時不重複表頭、不處理格子被切開（使用者選擇不做）。

## 做法

把「表與表之間的空白段落」改成：**第一位幼兒之前沒有，第二位起每張表之前放一個
`pageBreakBefore` 的段落**（取代原本接在每張表後面的空白段落）。

- 用段落的「從新頁開始」屬性（`pageBreakBefore`），不用手動分頁符號：上一張表剛好填滿一頁時，
  手動分頁符號會多出一張空白頁，`pageBreakBefore` 不會。
- 這個段落設成約 1pt 高（`spacing.line` 20 twips、`lineRule: exact`、字級 2 half-points），
  新頁頂端看不出多一行。
- 不在表格第一格上設屬性：LibreOffice／手機預覽不一定照做。
- 不切成多節（section）：頁首（標章＋標題）要每節重設，沒有好處。

匯入（`src/import/monthlyPlanDocxImport.js`）以 `<w:tbl>` 切割每位幼兒，表間段落不影響。

## 測試

`tests/monthlyPlanDocxExport.test.js` 加一則：兩位幼兒時，`document.xml` 中第二張 `<w:tbl>` 之前、
第一張 `</w:tbl>` 之後有含 `<w:pageBreakBefore/>` 的段落；第一張表之前沒有。
另以匯出→匯入往返確認兩位幼兒的資料仍完整。
