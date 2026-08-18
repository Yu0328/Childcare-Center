# 屏東縣內埔鄉育英公托填表系統

親子館嬰幼兒發展評量紀錄表數位化工具，取代原本用 Word 手抄的方式。涵蓋三張表：適性總表（C表）、適性紀錄(家長版)、月計畫。

## 使用

- **桌機離線版**：開啟 `dist/TableC.html`，雙擊即可用瀏覽器開啟，不需安裝、不需連網。
- **網頁版**：GitHub Pages 部署，手機瀏覽器可直接使用（PWA，可加到主畫面）。

資料存在瀏覽器本機資料庫，請定期用畫面上方的「匯出備份」下載備份檔，需要還原時用「匯入備份」讀回。

## 開發

```bash
npm install
npm test              # 執行測試
npm run build          # 產生 dist/TableC.html（離線版）
npm run build:web      # 產生 site/（網頁版），發布前需把 site/index.html、site/sw.js 複製到根目錄並一起 commit
```

設計文件與實作計畫在 `docs/superpowers/specs/`、`docs/superpowers/plans/`，開發慣例見 `CLAUDE.md`。
