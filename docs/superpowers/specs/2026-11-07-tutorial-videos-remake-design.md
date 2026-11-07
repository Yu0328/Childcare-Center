# 完整操作教學影片重做 — design

## Why

The two 完整操作教學 videos (電腦版 `OjBdyI0x72g`, 手機版 `Tt7wcXTPkjg`, recorded 2026-10-24) no
longer match the app. 課程月計畫 changed completely (per-child items, 套用其他幼兒月計畫, 排順序,
coloured 指標 picker — the chapter is already flagged `HELP_VIDEO_OUTDATED`), 適性紀錄 gained
several features, and the old videos recorded the offline `TableC.html`, so they never showed
Google sign-in, which is now how teachers actually start and keep their data. The user wants both
videos remade so the in-app 操作說明 matches what teachers see.

The pipeline that made the old videos (`video/`, per `2026-10-24-demo-videos-design.md` and
`plans/2026-10-24-demo-videos-pipeline.md`) is gone from disk and was never committed. It is
rebuilt from that plan; that design's decisions (voice, music, overlay effects drawn on the live
page, narration-driven timing, CDP screencast capture, burned-in captions + `.srt`, chapter list)
carry over unless changed below.

## Scope (decided with the user)

- **Two videos only**: 完整操作教學（電腦版） 1920×1080 and （手機版） 1080×1920 vertical. They
  replace the current two on YouTube.
- **育英 only**: recorded on the 育英 web build (`site/yuying/`) — 育英 title, badge and 月計畫
  defaults. No per-centre versions.
- **Not made**: the sales video, brand video, per-chapter clips, other languages.
- **Google sign-in is taught** (user's choice): 開始使用 shows the sign-in choice screen and signing
  in; 資料保存 explains automatic sync as the main way data is kept, with the backup file as the
  no-Google fallback (matches `project_google_signin_default`).

## Approaches

- **A. Rebuild the automated pipeline from the old plan (picked).** Repeatable: when the app changes
  again, edit one chapter's steps and re-run. Matches the old videos' voice and look.
- B. User screen-records by hand and narrates separately — no tooling, but ~20 min of footage to
  hand-time and edit, inconsistent style, and the whole job repeats on the next change.
- C. Re-record only changed chapters and splice into the old videos — ruled out: switching to the
  web build + Google sign-in also changes 開始使用 and 資料保存, so most of each video changes, and
  the music/visual seams would show.

## Changes from the old pipeline plan

1. **Web build, not `TableC.html`.** The recorder runs `npm run build:web` (default centre
   `yuying`), serves `site/` from a local static server, and opens `http://localhost:<port>/yuying/`.
   Service workers are blocked in the browser context (`serviceWorkers: 'block'`) so caching and the
   silent auto-update never interfere. No password step (removed 2026-10-24).
2. **Simulated Google, no real account.** The recorder intercepts, with Playwright routes, every
   Google URL the app calls — nothing in `src/` changes:
   - `https://accounts.google.com/gsi/client` → a stub script providing
     `google.accounts.oauth2.initTokenClient`. When the app requests a token, the stub draws a
     simple in-page account chooser (generic "選擇帳戶" box with one demo account, e.g. 育英老師 /
     teacher@example.com — no Google logo or copied Google artwork), the script clicks the account,
     and the stub calls back with a fake token.
   - `https://www.googleapis.com/oauth2/v3/userinfo` → `{ name: '育英老師' }`.
   - `https://www.googleapis.com/drive/v3/files…` and `/upload/drive/v3/files…` → an in-memory
     fake Drive (list, create, update, download, delete) good enough for `driveClient.js`, so
     sync really runs and shows its real status messages.
   - Anything else to Google that the recorder doesn't handle fails loudly (test the recording, not
     the internet).
3. **Off-camera setup** imports a fake-data backup (or seeds through the fake Drive) so chapters
   that need existing records have them. All names are fictional (王小明 etc.); nothing from
   `references/`. The Word file used in 匯入舊的 Word 檔 is produced by the app's own exporter from
   fake data before recording.
4. **Outputs** (`video/out/`, gitignored): per video `.mp4`, `.srt`, chapter list, a YouTube
   description text (same shape as last time: 影片重點, 章節, 小提醒, music credit — updated to the
   new features), and a thumbnail PNG. npm scripts `video:desktop`, `video:phone`.
5. **Music**: "From Here on In" (YouTube Audio Library) is no longer on disk — the user
   re-downloads it to `video/assets/music.mp3` (gitignored) before the final render. Renders
   without it work (no music track) so development isn't blocked.

## Chapter outline

Chapters stay the help chapters (`HELP_CHAPTERS` minus 實用技巧's standalone chapter and 常見問題),
so `HELP_VIDEOS` keeps the same keys. Both videos follow the same outline; the phone video uses the
phone screens and short labels.

| Chapter (`HELP_VIDEOS` key) | Content |
|---|---|
| 片頭 | intro card |
| 開始使用 `start` | open the site → sign-in choice screen → 使用 Google 帳號 → fake chooser → signed in (a few seconds, no detail); tour of the home cards; 加到主畫面／安裝 button (iPhone/Android on phone, Chrome install on desktop) |
| 管理幼兒 `children` | add a child (tier suggested from birthdate), delete one |
| 匯入舊的 Word 檔 `import` | import one Word file, confirm screen |
| 課程月計畫 `monthly-plan` | **all new flow**: create a month, 管理幼兒 incl. 排順序, plan a day for one child, 指標 picker colours (已達成／未達成／還沒做過) and the same-tier list, 套用其他幼兒月計畫, mark 請假, export Word (pages follow the child order) |
| 適性紀錄（家長版） `parent-report` | create, course plan + occurrences (請假／更換課程), **套用其他幼兒課程計畫**, **earlier-tier 指標** (指標所屬年齡層 switch), 發展紀錄, 行為觀察, 點滴分享 with **拖曳排照片** and **分開描述**, export → **今天／今日 check popup** (narration text deliberately contains 今天 to trigger it), reword, export |
| 適性總表 `assessment` | 彙整 from 適性紀錄 (incl. several months at once), fill, export |
| 資料保存 `backup` | sync status / 同步 button, data follows the Google account across phone and computer; backup export/import as the fallback without Google |
| 片尾 | outro card |

The exact narration and steps are written in the step scripts during implementation; the
user reviews them by watching the video, not as text.

## Review and handover

1. Desktop video first: the user watches it end to end; corrections go into the step scripts and it
   is re-rendered. Then the phone video, the same way.
2. The user uploads both to YouTube (unlisted) and gives the new video ids.
3. Then, in the app: `HELP_VIDEOS` gets the new ids, `minutes` and chapter start seconds (from the
   generated chapter lists); `HELP_VIDEO_OUTDATED` is emptied; `tests/helpView.test.js` updated;
   deploy.

## Constraints

- Voice `zh-TW-HsiaoChenNeural` via `edge-tts` (installed); ffmpeg installed; Playwright via
  `npm install --no-save playwright`.
- Only narration text leaves the machine (to the TTS service). No child data, real or fake, is
  sent anywhere; the fake Google never touches the network.
- Never commit mp4s, frames, the TTS cache, music, or backups.
- Marketing tone rule applies to narration: never imply teachers neglect observation — the gain is
  less repetitive form work.

## Non-goals / anti-goals

- No change to app code for the recording's sake (the fake Google lives entirely in the recorder).
  If a recording step genuinely can't be driven without one, stop and raise it.
- A video that shows any real child data, a real Google account, or a screen that no longer matches
  the app is a failure even if it renders.

## Answered by the user after review

- **Sign-in is shown briefly, not taught in detail**: choice screen → 使用 Google 帳號 → pick the
  demo account → signed in. No consent / "unverified app" screens are faked or explained.
- **The offline `TableC.html` is ignored**: teachers don't use it; no offline-only note or separate
  video.

## Calls made by Claude (user to check)

- **Install step**: show the app's own 加到主畫面／安裝 button and its explainer popup; the browser's
  native install dialog / iPhone Share sheet is not filmed (automated Chromium can't show it).
- **Cross-device sync** in 資料保存: narration over one session's sync status, not two recorded
  sessions side by side.
- **Length**: no hard cap; aim for roughly 12–15 min per video and trim during review.

## Left to the builder

- Port details of the old plan's tasks (timeline helpers, overlay, recorder, composer), phone
  viewport/scale to reach 1080×1920, how the fake data is seeded, the fake Drive's internals.
- Exact wording and pacing of each step.
