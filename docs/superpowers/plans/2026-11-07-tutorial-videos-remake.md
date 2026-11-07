# 完整操作教學影片重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run video:desktop` / `npm run video:phone` record the 育英 web build with simulated Google sign-in and produce the two 完整操作教學 videos (mp4 + srt + chapters + YouTube description + thumbnail); after the user uploads them, 操作說明 points at the new videos.

**Architecture:** The old pipeline (`docs/superpowers/plans/2026-10-24-demo-videos-pipeline.md`, its code was never committed) is rebuilt: narration first (edge-tts, cached), Playwright drives the page with an injected overlay while the CDP screencast captures frames, ffmpeg composes. New: the recorder serves `site/` over localhost, blocks service workers, fixes the clock, seeds fake data off camera with the app's own storage code, and answers every Google URL from an in-recorder fake (GIS stub with a drawn account chooser, userinfo, in-memory Drive). Chapter steps live in one module per chapter, shared by both layouts.

**Tech Stack:** Node ESM (`.mjs`), Playwright (`npm install --no-save playwright`), esbuild (already a devDependency), `edge-tts` (Python, installed), ffmpeg/ffprobe (on PATH), vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-tutorial-videos-remake-design.md`

## Global Constraints

- Voice `zh-TW-HsiaoChenNeural`, rate `+0%`.
- Desktop 1920×1080; phone 1080×1920 (viewport 412×732, `deviceScaleFactor` 1080/412, `isMobile`, `hasTouch`).
- 育英 only: `npm run build:web`, page `http://127.0.0.1:<port>/yuying/`.
- No real Google, no real network: every request that isn't to the local server is either answered by the fake or aborted and reported; the run fails if any was aborted.
- No change to `src/` for the recording's sake. If a step can't be driven without one, stop and report.
- Fake data only (fictional names such as 王小明); nothing from `references/`; no seeded text contains 今天 or 今日.
- Sign-in on camera is brief: choice screen → 使用 Google 帳號 → pick the demo account → signed in. No consent/unverified screens.
- Narration never implies teachers neglect observation; the gain is less repetitive form work.
- Music: `video/assets/music.mp3` (copied from `D:/Users/Downloads/From Here on In - Everet Almond.mp3`). `video/out/` and `video/assets/` are gitignored (already in `.gitignore`); never commit mp4s, frames, TTS cache, music.
- `package.json` has no `"type"`, so Node files are `.mjs`. Tests: `npx vitest run tests/` (scoped — see CLAUDE.md).

## Review Focus

1. A Drive request shape the fake doesn't handle → the app shows a sync error on camera. Pinned by Task 2's round-trip test through the real `createDriveClient`, and Task 5's "unhandled requests fail the run".
2. A request leaking to the real internet (Google, YouTube thumbnail, fonts) → pinned by Task 5's route-everything rule; make.mjs exits non-zero listing the URLs.
3. A popup nobody scripted appearing mid-video (月計畫 one-time notice, 今天 check, install prompt, merge prompt on first sign-in) → seeded text has no 今天/今日 (Task 4 test); setup marks one-time notices seen (Task 5); recording fails on a step timeout rather than filming a stuck screen.
4. Re-rendering on a different day changing what's on screen (default month, suggested tier, 今天 dates) → clock fixed in Task 5; seed dates are absolute (Task 4 test).
5. The silent auto-update reloading the page mid-recording → service workers blocked (Task 5).

## File Structure

| File | Responsibility |
|---|---|
| `video/lib/timeline.mjs` + `tests/videoTimeline.test.js` | pure helpers (port of old Task 1, verbatim) |
| `video/lib/tts.mjs` | cached edge-tts (old Task 2, verbatim) |
| `video/lib/overlay.js` | `window.__demo` overlay (old Task 3, verbatim) |
| `video/lib/fakeDrive.mjs` + `tests/videoFakeDrive.test.js` | in-memory Drive answering `driveClient.js`'s requests |
| `video/lib/fakeGis.js` | browser stub for `https://accounts.google.com/gsi/client` with a drawn account chooser |
| `video/seed/data.mjs` + `tests/videoSeedData.test.js` | the fake dataset as plain data |
| `video/seed/seedEntry.js` | browser entry, bundled by esbuild, writes `data.mjs` into IndexedDB with `src/storage/*` and builds the import-chapter Word file |
| `video/lib/serve.mjs` | static server for `site/` |
| `video/lib/recorder.mjs` | browser context, routes, clock, seeding, screencast, helper API |
| `video/lib/compose.mjs` | ffmpeg compose (old Task 5, music optional) |
| `video/make.mjs` | CLI: build, tts, record, compose, description, thumbnail |
| `video/scripts/chapters/<id>.mjs` | one module per chapter: `steps(layout)` |
| `video/scripts/tutorial-desktop.mjs`, `tutorial-phone.mjs` | intro + chapters + outro per layout |
| `video/descriptions/tutorial-desktop.txt`, `tutorial-phone.txt` | YouTube description templates with `{{chapters}}` |
| `video/assets/photos/*.jpg` | generated placeholder photos (gitignored with `video/assets/`) |

---

### Task 0: Worktree, music, dependencies

- [ ] **Step 1:** `git worktree add .claude/worktrees/tutorial-videos -b tutorial-videos`
- [ ] **Step 2:** In the worktree: `mkdir -p video/assets && cp "D:/Users/Downloads/From Here on In - Everet Almond.mp3" video/assets/music.mp3 && npm install && npm install --no-save playwright`
- [ ] **Step 3:** Verify: `ffprobe -v error -show_entries format=duration -of csv=p=0 video/assets/music.mp3` prints ≈189; `npx vitest run tests/` green.

All later tasks run in `.claude/worktrees/tutorial-videos`.

---

### Task 1: Port timeline, TTS, overlay

**Files:** Create `video/lib/timeline.mjs`, `tests/videoTimeline.test.js`, `video/lib/tts.mjs`, `video/lib/overlay.js`.

**Interfaces — Produces:** exactly the old plan's Task 1–3 interfaces: `ttsKey`, `splitCaption`, `toSrt`, `toChapters`, `frameDurations`; `VOICE`, `synth(text, { dir, rate })`, `probeDuration(file)`; `window.__demo.{moveTo, ripple, ring, clearRing, caption, card, hideCard, chapter, zoom, unzoom}`.

- [ ] **Step 1:** Copy the test file from old plan Task 1 Step 1 verbatim; run `npx vitest run tests/videoTimeline.test.js` → FAIL (module missing).
- [ ] **Step 2:** Copy `timeline.mjs` (old Task 1 Step 3), `tts.mjs` (old Task 2 Step 1), `overlay.js` (old Task 3 Step 1) verbatim. In `overlay.js` change the comment `ponytail:` to `shortcut:`.
- [ ] **Step 3:** `npx vitest run tests/videoTimeline.test.js` → PASS (8 tests). TTS smoke check from old Task 2 Step 2 → prints a file and `true`.
- [ ] **Step 4:** Commit `feat(video): timeline helpers, cached narration, overlay`.

---

### Task 2: Fake Drive

**Files:** Create `video/lib/fakeDrive.mjs`; Test `tests/videoFakeDrive.test.js`.

**Interfaces — Produces:** `createFakeDrive(): { handle(req: { method: string, url: string, headers: Record<string,string>, body: Buffer | null }): { status: number, contentType: string, body: Buffer | string }, files: Map<string, { id, name, mimeType, parents: string[], appProperties: object, trashed: boolean, content: Buffer }> }`.

Must answer every request `src/sync/driveClient.js` makes — read it for the exact shapes: `GET /drive/v3/files?q=…&fields=…&pageToken=…` (evaluate the `q` clauses the client builds: `name = '…'`, `'<id>' in parents`, `mimeType = …`, `trashed = false`, and any `appProperties has { key='…' and value='…' }`), `POST /drive/v3/files` (folder create), `POST|PATCH /upload/drive/v3/files[/<id>]?uploadType=multipart` (parse the multipart body: JSON metadata part + content part), `GET /drive/v3/files/<id>?alt=media`, `PATCH /drive/v3/files/<id>` (trash). Ids are `fake-1`, `fake-2`, …. Unknown request → `{ status: 501 }` and `handle.unhandled` gets the URL pushed (array on the returned object, `unhandled: string[]`).

- [ ] **Step 1: Failing test** — drive the real client: `createDriveClient({ auth, fetchImpl })` where `auth` returns `'fake-token'` (match the shape `createDriveClient` expects — read it) and `fetchImpl(url, opts)` converts to `handle()` and wraps the result in a `Response`. Tests:
  - `ensureFolder` twice returns the same id and creates one folder named `FOLDER_NAME`.
  - `uploadRecord` then `listCloud` lists it with its `appProperties`; `downloadRecord` returns the payload deep-equal.
  - `uploadRecord` with `fileId` updates in place (still one file, new payload).
  - `uploadPhoto` a `Blob` of bytes `[1,2,3]`, `downloadPhoto` returns the same bytes.
  - `trashFile` removes it from `listCloud`.
  - the manifest read path the client uses (whatever `MANIFEST_NAME` handling `driveClient.js` does) works on an empty drive and after a write.
  - `drive.unhandled` is empty after all of the above; a `GET https://www.googleapis.com/drive/v3/about` yields status 501 and appears in `unhandled`.
- [ ] **Step 2:** `npx vitest run tests/videoFakeDrive.test.js` → FAIL.
- [ ] **Step 3:** Implement `createFakeDrive` in `video/lib/fakeDrive.mjs`.
- [ ] **Step 4:** → PASS; `npx vitest run tests/` green.
- [ ] **Step 5:** Commit `feat(video): in-memory fake Drive for recordings`.

---

### Task 3: GIS stub with drawn account chooser

**Files:** Create `video/lib/fakeGis.js` (browser script, served by a route as the body of `https://accounts.google.com/gsi/client`).

**Interfaces — Produces (in page):** `window.google.accounts.oauth2.initTokenClient({ client_id, scope, callback, error_callback }) → { requestAccessToken(options) }`. `requestAccessToken` shows a centred modal: white card, title 「選擇帳戶」, subtitle 「以繼續使用 育英公托填表系統」, one row with a round avatar 「育」 + 「育英老師」 / `teacher@example.com`; the row has `data-fake-account`. Clicking it removes the modal and calls `callback({ access_token: 'fake-token', expires_in: 3599, scope })`. No Google logo or Google artwork. The modal is appended to `<html>` (like the overlay) so the overlay's zoom never scales it.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Checked end to end in Task 5 Step 4 (screenshot shows the chooser).
- [ ] **Step 3:** Commit `feat(video): GIS stub with a drawn demo-account chooser`.

---

### Task 4: Fake dataset and seeding bundle

**Files:** Create `video/seed/data.mjs`, `video/seed/seedEntry.js`; Test `tests/videoSeedData.test.js`.

**Interfaces — Produces:**
- `data.mjs` default export `{ children: [...], forms: [...], parentReports: [...], monthlyPlans: [...], importDocx: {...} }` — plain objects, dates as absolute `YYYY-MM-DD`, children referenced by name.
- `seedEntry.js`, bundled by esbuild (`format: 'iife'`, `globalName: '__seed'`, `define: { __CENTER_ID__: '"yuying"', __CENTER_BADGE__: <yuying word-badge base64> }` — same defines as `scripts/build-web.mjs`) exposes `__seed.seed(): Promise<void>` (writes `data.mjs` through `src/storage/db.js`, `parentReportDb.js`, `monthlyPlanDb.js`) and `__seed.importDocxBase64(): Promise<string>` (a 總表 `.docx` for `importDocx` built with the app's own 總表 exporter, `generateDocxBlob`).

Dataset (recording date is 2026-11-16, 115年11月):

| Child | Birthdate | Purpose |
|---|---|---|
| 王小明 | 2024-03-15 | main child: 適性紀錄 115年10月 exists (彙整 several months); 總表 entries giving ○ on some indicators and △ on others so the 月計畫 picker shows all three colours |
| 林小美 | 2024-05-02 | same tier: complete 月計畫 115年11月 (source for 套用其他幼兒月計畫) and 適性紀錄 115年11月 with course plan (source for 套用其他幼兒課程計畫) |
| 陳小華 | 2024-01-20 | same tier; the import chapter imports her 115年9月 總表 (`importDocx`, not seeded into the DB) |
| 張小安 | 2025-02-10 | younger tier, so the child list shows two tiers |
| 黃小寶 | 2024-09-09 | deleted on camera in 管理幼兒 |

The new child added on camera is 李小樂 2024-08-08 (in the chapter script, not seeded). Notes, narratives and highlight captions are short plausible sentences.

- [ ] **Step 1: Failing test** (`tests/videoSeedData.test.js`): every string anywhere in `data.mjs` has no 今天/今日 (use `findTodayWords`'s word list, `TODAY_WORDS` from `src/domain/findTodayWords.js`); every date matches `^\d{4}-\d{2}-\d{2}$`; every indicator code exists in `src/data/indicators.js`; children names are unique and every reference resolves; 李小樂 is not seeded.
- [ ] **Step 2:** → FAIL. **Step 3:** Write `data.mjs` and `seedEntry.js`. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(video): fake dataset and in-page seeding bundle`.

---

### Task 5: Static server, recorder, composer, CLI

**Files:** Create `video/lib/serve.mjs`, `video/lib/recorder.mjs`, `video/lib/compose.mjs`, `video/make.mjs`, `video/scripts/smoke.mjs`; Modify `package.json` scripts.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `serve(dir: string): Promise<{ url: string, close(): Promise<void> }>` — node `http`, mime by extension, `127.0.0.1`, random port.
  - `record({ layout, setup?, steps, framesDir, appUrl }): Promise<{ frames, end, clips, cues, chapters, unhandled: string[] }>` — old Task 4's `record` plus the changes below.
  - `compose({ name, rec, outDir, music: string | null })` — old Task 5's, with no music input/graph branch when `music` is null.
  - Step script format: old plan's, plus optional top-level `setup: async d => {}` run before capture starts.
  - Helper API `d`: old plan's (`click`, `type`, `select`, `highlight`, `clearHighlight`, `zoom`, `unzoom`, `card`, `hideCard`, `wait`, `page`) plus `d.setFiles(sel, paths: string[])` (cursor + ripple on the visible picker button, then `setInputFiles` on the input — the OS file dialog is never shown) and `d.drag(fromSel, toSel)` (cursor glides to source, mouse down, glides to target in ~800 ms with intermediate `mouse.move` steps, mouse up).
  - npm scripts: `"video": "node video/make.mjs"`, `"video:desktop": "node video/make.mjs tutorial-desktop"`, `"video:phone": "node video/make.mjs tutorial-phone"`.

Recorder changes from the old Task 4:
- No password unlock (removed); drop `unlockHash`.
- Context: `serviceWorkers: 'block'`, `locale: 'zh-TW'`, `timezoneId: 'Asia/Taipei'`, `bypassCSP: true` kept.
- Clock: `context.clock.install({ time: new Date('2026-11-16T09:30:00+08:00') })` — time then flows normally. Verify overlay transitions and app timers still run; if `install` stalls them, fall back to `clock.setFixedTime` only if the app has nothing measuring elapsed time on camera.
- Routes (`context.route('**/*')`): local server → continue; `accounts.google.com/gsi/client` → `fakeGis.js`; `www.googleapis.com/oauth2/v3/userinfo` → `{ "name": "育英老師" }`; `www.googleapis.com/drive/…` and `/upload/drive/…` → `fakeDrive.handle`; anything else → `abort()` and push the URL to `unhandled` (plus `fakeDrive.unhandled`).
- Off-camera before the screencast: `goto(appUrl)`, inject the seed bundle (`page.addScriptTag({ content })`, built in-process with esbuild), `await __seed.seed()`, mark one-time notices seen (the 月計畫 notice key in `src/ui/monthlyPlanNotice.js` and any other first-run popup found while recording), write the import `.docx` to `video/out/fixtures/陳小華_總表.docx` and the placeholder photos to `video/assets/photos/` (generate if missing: `ffmpeg -f lavfi -i "gradients=s=1200x900:seed=<n>" -frames:v 1` + drawtext 「示範照片 <n>」), reload, wait for the sign-in choice screen, then run `script.setup(d)` if any.
- Every helper waits at most 10 s for its selector; a timeout aborts the run with the step index and selector.

make.mjs: `npm run build:web`, serve `site/`, tts every `say`, record at `${url}/yuying/`, compose with `video/assets/music.mp3` if it exists else `null` (print a warning), write `video/out/youtube-<name>.txt` from `video/descriptions/<name>.txt` replacing `{{chapters}}` with the chapters text (skip if no template), write `video/out/thumb-<name>.png` with `ffmpeg -ss 1 -i <mp4> -frames:v 1`. Exit non-zero, after writing outputs, if `rec.unhandled` is non-empty, printing each URL.

`video/scripts/smoke.mjs` (desktop, ~20 s): intro card → sign in (click 使用 Google 帳號 on the choice screen, click `[data-fake-account]`) → home → highlight 管理幼兒 → outro.

- [ ] **Step 1:** Implement the files above.
- [ ] **Step 2:** `npm run video -- smoke` → completes; prints frame count at ≥ 20 fps captured; exit code 0 (no unhandled requests).
- [ ] **Step 3:** `ffprobe` (old Task 6 Step 5 command) on `video/out/smoke.mp4` → 1920×1080, 30/1, aac; `video/out/thumb-smoke.png` exists.
- [ ] **Step 4:** Watch it (`start video/out/smoke.mp4`): chooser drawn as specified, home shows the seeded children after sign-in, the header shows a synced state (not an error), music under the voice. Fix and re-run until right.
- [ ] **Step 5:** Phone check: copy smoke with `layout: 'phone'` (old Task 6 Step 7 approach) → `1080,1920`, mobile layout; delete the copy.
- [ ] **Step 6:** Commit `feat(video): web-build recorder with fake Google, seeding, CLI`.

---

### Task 6: Chapter scripts and the desktop video

**Files:** Create `video/scripts/chapters/{start,children,import,monthly-plan,parent-report,assessment,backup}.mjs`, `video/scripts/tutorial-desktop.mjs`, `video/descriptions/tutorial-desktop.txt`. Delete `video/scripts/smoke.mjs`.

**Interfaces:** each chapter module `export const title` (the help chapter title: 開始使用, 管理幼兒, 匯入舊的 Word 檔, 課程月計畫, 適性紀錄（家長版）, 適性總表, 資料保存) and `export function steps(layout: 'desktop' | 'phone'): Step[]` whose first step carries `chapter: title`. `tutorial-desktop.mjs` = `{ layout: 'desktop', steps: [intro card 「育英公托填表系統」/「完整操作教學（電腦版）」, ...each chapter's steps in the order above, outro card 「感謝收看」] }`.

Content per chapter is the spec's chapter outline table. Specifics:
- 開始使用: the sign-in is the first few seconds; no detail on Google screens. Install: the header's 安裝 button and its explainer popup only.
- 課程月計畫: on 王小明 — create 115年11月 plan, 管理幼兒 with 排順序, plan one day, open the 指標 picker and point at the three colours and the same-tier list, 套用其他幼兒月計畫 from 林小美, mark 請假 on a day, export Word.
- 適性紀錄（家長版）: on 王小明 115年11月 — 套用其他幼兒課程計畫 from 林小美, one occurrence 請假, 指標所屬年齡層 switch to an earlier tier and pick one, 發展紀錄, 行為觀察, 點滴分享 with 3 placeholder photos, drag one to reorder, 分開描述, then 匯出: a 發展紀錄 sentence typed earlier contains 今天 so the check popup opens; reword it in the popup; export completes.
- 適性總表: 彙整 王小明's 115年10月 and 11月 into one 總表, fill one entry, export.
- 資料保存: the header sync status and 同步 button; narration: data follows the Google account on phone and computer; the backup file is the fallback without Google. If signing out is harmless (read `wireSyncControls.js`: it must not delete local data), sign out at the end to show the guest header's 備份 buttons; otherwise narration only.
- Word exports: after each export, the downloaded file isn't opened on camera; narration says where it goes (下載 folder).
- Selectors come from the real views (`src/ui/*View.js`); labels said in narration must be the labels on screen.

- [ ] **Step 1:** Write the chapter modules (desktop branch) and `tutorial-desktop.mjs`, the description template (old video's shape: 影片重點 updated to the current features — per-child 月計畫, 套用其他幼兒月計畫/課程計畫, 今天 check, 分開描述, Google 同步 — then 章節 `{{chapters}}`, 小提醒, 背景音樂 credit).
- [ ] **Step 2:** `npm run video:desktop` → exit 0. Check `video/out/tutorial-desktop-chapters.txt` has the 8 lines (片頭 + 7 chapters).
- [ ] **Step 3:** Watch end to end yourself first: every label in narration matches the screen; no unscripted popup; no error banner; zooms land on their targets. Fix and re-run.
- [ ] **Step 4:** Commit `feat(video): 完整操作教學（電腦版） step scripts`.
- [ ] **Step 5:** Hand to the user (繁體中文, plain words): path of `video/out/tutorial-desktop.mp4`, length, what to check. Apply corrections, re-render, until approved.

---

### Task 7: Phone video

**Files:** Modify the chapter modules (phone branch: the ＋ / popup openers and short labels the phone layout uses); Create `video/scripts/tutorial-phone.mjs`, `video/descriptions/tutorial-phone.txt`.

- [ ] **Step 1:** Add phone branches; 開始使用's install part uses the phone 加到主畫面 explainer. Zoom sparingly.
- [ ] **Step 2:** `npm run video:phone` → exit 0; `ffprobe` → `1080,1920`.
- [ ] **Step 3:** Watch it yourself, fix, commit `feat(video): 完整操作教學（手機版） step scripts`.
- [ ] **Step 4:** Hand to the user as in Task 6 Step 5; iterate until approved.
- [ ] **Step 5:** Copy the final outputs (`tutorial-*.mp4`, `.srt`, `-chapters.txt`, `youtube-*.txt`, `thumb-*.png`) to `C:/Users/Kmeie/Desktop/claude/育英公托_影片成品/` after moving the old ones into a `舊版/` subfolder there.
- [ ] **Step 6:** Merge: fast-forward `tutorial-videos` into `main`, push, delete branch and worktree (CLAUDE.md version-control rules). The music stays only in the main checkout's `video/assets/` (copy it there before removing the worktree).

---

### Task 8: Point 操作說明 at the new videos (after the user uploads)

**Files:** Modify `src/ui/helpContent.js` (`HELP_VIDEOS`, `HELP_VIDEO_OUTDATED`), `tests/helpView.test.js`; Modify `CLAUDE.md` (操作說明 paragraph: drop the `HELP_VIDEO_OUTDATED` sentence about the old 月計畫 screen; add one line that videos are made with `npm run video:desktop|phone`, see this plan's spec).

- [ ] **Step 1:** Wait for the user to give both new YouTube ids.
- [ ] **Step 2:** Update the test's expected ids/times (from the generated chapter lists, chapter key → start seconds) → run → FAIL.
- [ ] **Step 3:** Update `HELP_VIDEOS.desk`/`.phone` (`id`, `minutes` rounded up, `chapters`) and empty `HELP_VIDEO_OUTDATED` (`new Set()`; keep the export and `OUTDATED_NOTE` for next time).
- [ ] **Step 4:** `npx vitest run tests/` green; `npm run build:web`; open `site/yuying/` 操作說明 at desktop and phone widths and confirm the chapter links jump to the right times.
- [ ] **Step 5:** Commit `feat(操作說明): 換成新版完整操作教學影片`, push `main`, check `gh run list --workflow=deploy.yml`.
