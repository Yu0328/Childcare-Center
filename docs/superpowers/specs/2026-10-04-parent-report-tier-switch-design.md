# 適性紀錄 課程計畫表 — 指標所屬年齡層 switch — design

## Problem

A 適性紀錄's 課程計畫表 indicator picker only lists the report's own tier. Teachers sometimes need
to keep tracking an earlier tier's indicator (the child hasn't caught up yet). The 月計畫 editor
already solves this with a 「指標所屬年齡層」 button row (`monthlyPlanEditorView.js`,
`.tier-switch`); the 適性紀錄 side should get the same.

## Change

### Add form (`src/ui/courseplanTabView.js`)

- Above the 指標 select in 新增課程計畫項目, a 「指標所屬年齡層」 row: one `.tier-switch__btn` per
  `TIERS` entry, same markup/CSS as the 月計畫 panel. Starts on `report.tier`.
- Clicking a tier swaps the select's options to that tier's indicators (`indicatorOptionsHtml`)
  and prefills 活動名稱 / 能力指標內容 from the newly listed first indicator — same as the initial
  render does for the report's own tier, so the fields never describe an indicator that isn't
  selected.
- The entry is saved with whatever code was picked; nothing else about saving changes. After a
  successful add the tab re-renders (existing `onChange`), so the row is back on `report.tier`.

### Edit form (same file, `entryCard`)

- Same button row above the edit 指標 select, starting on **the entry's own indicator tier**
  (`getIndicator(entry.indicatorCode)?.tier`), falling back to `report.tier` for an unresolvable
  code.
- The select is built for that tier, so an earlier-tier entry lists its own tier's indicators with
  its code selected — no more lone 「（目前的指標）」 option for resolvable codes. That fallback
  option stays for unresolvable codes.
- Switching tiers in the edit form only swaps the options; it does not touch 活動名稱 / 能力指標內容
  (the edit form never auto-fills them today, and overwriting text the teacher already wrote while
  editing would lose it).

### Ordering (screen and exported Word)

Within one domain: the report's own-tier indicators first, then other tiers in Ⅰ→Ⅵ order; within
a tier, by item number; unresolvable codes last.

```
身體動作 (Ⅳ report): Ⅳ-1-1 → Ⅳ-1-2 → Ⅳ-1-3 → Ⅲ-1-2
```

- One shared comparator, `compareIndicatorCodesForTier(tier)` in `src/data/indicators.js`,
  used by both `courseplanTabView.js` (replacing `indicatorItemNumber`'s sort) and
  `parentReportDocxExport.js`'s `buildCoursePlanRowGroups` (replacing `coursePlanSortKey`).
- `buildCoursePlanRowGroups(entries, occurrencesByEntryId, tier)` / `buildCoursePlanTable(…, tier)`
  gain a `tier` argument; the exporter passes `report.tier`. Domain order is unchanged (still by
  domain id).

### Not changed

- 彙整 into a 總表: an off-tier entry still lands in the target 總表's 備註 rows
  (`aggregateCoursePlan.js`), as today.
- Word export domain grouping: already by each entry's own indicator domain.
- 套用其他幼兒課程計畫 copies codes verbatim, so off-tier entries copy over as-is.

## Testing

- `tests/indicators.test.js`: comparator — own tier first, other tiers Ⅰ→Ⅵ, item number within a
  tier, unresolvable last.
- `tests/parentReportDocxExport.test.js`: `buildCoursePlanRowGroups` with a mixed-tier domain
  orders own tier first.
- `tests/courseplanTabView.test.js`: add form starts on the report's tier; clicking Ⅲ swaps the
  options and prefills; the saved entry has the Ⅲ code; an Ⅲ entry in an Ⅳ report renders after the
  Ⅳ ones in its domain card; its edit form starts on Ⅲ with its code selected.
- `npm run build` + Playwright on `dist/TableC.html`: add an Ⅲ indicator to an Ⅳ report, check the
  card order, edit it to another Ⅲ indicator, export Word.
