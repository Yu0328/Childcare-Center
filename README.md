# 屏東縣內埔鄉育英公托填表系統

親子館嬰幼兒發展評量紀錄表（C表）數位化工具。單一 HTML 檔案，雙擊即可用瀏覽器開啟，Windows/Mac 皆可用，不需安裝任何軟體。

## 使用

打開 `dist/TableC.html` 即可使用。資料存在瀏覽器本機資料庫；請定期用畫面上方的「匯出備份」下載一份備份檔案，需要還原時用「匯入備份」讀回。

## 開發

```bash
npm install
npm test          # 執行所有測試
npm run build      # 產生 dist/TableC.html
```

設計文件：`docs/superpowers/specs/2026-08-07-c-form-digitization-design.md`
