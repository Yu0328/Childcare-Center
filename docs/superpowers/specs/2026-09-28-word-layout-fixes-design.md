# Word layout fixes

Found by opening every round-tripped export in real Word (page-by-page render), not by unit tests.

## Changes

- **總表 title**: 17pt → 16pt. This institution's name is two characters longer than the original's, and at 17pt the title's last 「月」 wrapped onto its own line.
- **總表 body rows**: `cantSplit` — a page break used to cut a row (and its 備註) in half across two pages.
- **適性紀錄 課程計畫表 rows**: `cantSplit` — a split last row left a near-empty final page holding one line.
- **Latin tier codes**: `VI-`/`VII-` normalize to Ⅵ/Ⅶ. A real 月計畫 file types tier Ⅵ as "VI-5-1", which was read as "V" + "I-5-1".

## Left as is

- Column header not repeated on later pages, a reference line duplicated inside one narrative, logo overlapping the title's first character: all identical in the original files.
- A legacy 月計畫 cell written as bare-code paragraph / name paragraph now imports as separate code-only and free items instead of merged. It can't be told apart from this app's own export of a code-only item followed by a free activity (same centering, one run per paragraph), and the earlier review decided that case must not merge. Nothing is lost; staff can tidy it in the editor.
- 適性紀錄 exports are 50–105 MB because photos keep full phone resolution (same as the originals). Shrinking them is a separate decision.
