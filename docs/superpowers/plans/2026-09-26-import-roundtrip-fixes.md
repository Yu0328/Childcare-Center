# Import round-trip fixes — plan

Spec: `../specs/2026-09-26-import-roundtrip-fixes-design.md`. TDD per task; `npx vitest run tests/`.

1. `parentReportDocxImport.js`: collect `embedIds` per 點滴分享 photo row; `resolveEmbeddedPhotos`
   via `document.xml.rels`, falling back to media order. Test: hash-named media + header logo.
2. `parentReportDocxImport.js`: `flagsAndNote` strips 請假／更換課程 from struck rows and sets the
   matching flag. Tests: `it.each` over label/no-label/label+note.
3. `monthlyPlanDocxImport.js`: lines split on `<w:br/>` only; `【name】`-before-code merge; unbracket
   merged names; bracketed free item triggers the legacy path. Tests per legacy layout.
4. `indicators.js`: `INDICATOR_CODE_PATTERN_SOURCE` + fullwidth prefix normalization; importers use
   it. Tests: Ⅶ/fullwidth codes match and parse.
5. `toast.js`: `replaceChildren` instead of `appendChild`; update multi-file toast tests.
6. Verify: build, real-file round-trip (photos kept, no note/flag diffs), 月計畫 fragment counts = 0.
