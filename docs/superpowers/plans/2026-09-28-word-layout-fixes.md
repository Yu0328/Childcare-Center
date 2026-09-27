# Word layout fixes — plan

Spec: `../specs/2026-09-28-word-layout-fixes-design.md`

1. Test: 總表 title run is `<w:sz w:val="32"/>`; every body row carries `<w:cantSplit/>`. Change `HEADER_TITLE_SIZE` and `bodyRow` in `src/export/docxExport.js`.
2. Test: 適性紀錄 course-plan row carries `<w:cantSplit/>`. Change `coursePlanBodyRow` in `src/export/parentReportDocxExport.js`.
3. Test: `getIndicator('VI-5-1')` is Ⅵ-5-1, `normalizeIndicatorCode('VII-1-1')` is Ⅶ-1-1, shared pattern matches both. Extend the Latin prefix map/pattern in `src/data/indicators.js`, longest prefix first.
4. `npx vitest run tests/`, real-file round-trip, re-render exports in Word to confirm title on one line and no split rows.
