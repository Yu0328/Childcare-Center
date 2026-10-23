# 系統展示影片 (demo videos) — design

## Problem

The app is being sold (buyout) to a 公托, and its teachers need to learn it. The in-app 操作說明
explains each task with drawn mini screens, but there is no video showing the real app end to
end — nothing a decision-maker can watch in a few minutes, and nothing a teacher can follow
along with from start to finish.

## Decisions (from discussion with the user)

- **Three videos**, all uploaded by the user to YouTube as 不公開 (unlisted):

  | Video | Layout | Output | Length (est.) |
  |---|---|---|---|
  | 推銷精華版 | 電腦版 | 1920×1080 | 3–5 min |
  | 完整教學版（電腦） | 電腦版 | 1920×1080 | 15–20 min |
  | 完整教學版（手機） | 手機版 | 1080×1920 (vertical, normal upload — not a Short) | 15–20 min |

- **Not split into short clips.** Each tutorial is one long video. Navigation is by YouTube
  chapters (timestamp list the pipeline prints, pasted into the description) plus an on-screen
  chapter title card and a corner chapter label. Not a Short: Shorts cap at 3 min and have no
  chapters.
- **Not embedded in the app's 操作說明** — video files would bloat the PWA.
- **Narration: Microsoft online neural TTS via `edge-tts`, voice `zh-TW-HsiaoChenNeural`**
  (曉臻), default rate/pitch; tweak per video only if a listen-through calls for it. Only
  narration text is sent to the service — no child data. Open-source Taiwanese-Mandarin
  models (BreezyVoice etc.) were considered and deferred: they need a consented reference voice
  recording, run slowly on the 4 GB laptop GPU, and need WSL on Windows.
- **Music: "From Here on In" from the YouTube Audio Library**, downloaded by the user. Ducked
  under narration. Its license covers use in videos, not redistribution, so it is gitignored.
- **Approach: effects drawn on the live app while recording** (not post-production zoom, not
  Remotion). An overlay layer injected into the page draws cursor, click ripple, highlight ring +
  callout bubble, captions, and zoom (CSS transform on the app root). Zooming the real page keeps
  text sharp; post-recording zoom blurs it. Remotion adds a whole toolchain for nicer title
  cards only.
- **Narration drives timing.** Each step's voice clip is generated first; the recorder knows each
  clip's duration and paces actions to it, so voice and on-screen action line up without manual
  editing.
- **Captions both burned in and as an `.srt`** for upload to YouTube.
- **Fake data only.** Fictional children (e.g. 王小明, already used by 操作說明). Nothing from
  `references/`. The sales video's opening "old Word form" is also built from fake data.

## Sales video storyline (~4 min)

1. 開場 (20s) — pain point: every month, every child, the same indicator text re-copied in Word.
   Shows a fake old Word form.
2. 新增幼兒 (20s) — name + birthdate; tier suggested automatically.
3. 月計畫 (60s) — plan a day once, shared by every same-tier child; 請假 and 補課 (指定新增).
4. 適性紀錄（家長版） (60s) — pick indicators instead of typing; add a photo; export Word, zoom
   into the exported document.
5. 彙整成總表 (40s) — the biggest time-saver.
6. 資料與手機 (20s) — data stays on the device, backup, works on a phone.
7. 結尾 (20s) — 「感謝收看」 + system name. No contact details.

## Tutorial structure

Follows the 操作說明 chapters (`src/ui/helpContent.js`): 開始使用, 管理幼兒, 匯入舊的 Word 檔,
課程月計畫, 適性紀錄（家長版）, 適性總表, 實用技巧, 資料保存. Web-only items (e.g. 安裝到電腦) appear
only where they apply to the layout being recorded. Google 帳號同步 and 常見問題 are left out.

## Visual style

- Cursor glides to its target; soft ripple on click.
- Highlight: soft glowing ring around the target + short callout bubble.
- Zoom: ease in under 1 s to a region, ease back out after. Used sparingly on phone.
- Captions: bottom, semi-transparent dark bar, white text. Phone: raised clear of YouTube's
  mobile player controls.
- Colors taken from the app's own palette.
- Intro card (system name + one-line tagline, fade), chapter cards (tutorials), outro card.

## Pipeline

All under a new `video/` directory:

- `video/scripts/<video>.mjs` — one script per video: an ordered list of steps, each
  `{ chapter?, say, do }` — narration text plus the actions (click, type, highlight, zoom).
  Changing a video means editing only this file.
- TTS step: each `say` → mp3 via `edge-tts`, cached by text hash so a re-run only regenerates
  changed lines.
- Recorder (Playwright, `npm install --no-save playwright` like the UI tests): builds
  `dist/TableC.html`, sets up off camera (unlock password gate, import a fake-data backup), then
  plays the steps with the overlay injected, logging each clip's start time.
- **Frame capture**: Playwright's built-in `recordVideo` encodes at a low bitrate that blurs small
  text, so frames are captured via the CDP screencast at full quality and encoded with ffmpeg
  (already installed). First implementation task verifies this produces sharp 1080p/vertical
  output; fall back to `recordVideo` only if it does.
- Composer (ffmpeg): lays narration clips at their logged times, adds ducked music (the track is
  3:09, so the tutorials loop it — a crossfade at the seam is added only if the loop point is
  audible; it fades out over the outro) and
  intro/outro, outputs the `.mp4`, the `.srt`, and the YouTube chapter list.
- Outputs and music in `video/out/` and `video/assets/`, both gitignored.
- npm scripts: `video:sales`, `video:desktop`, `video:phone`.

## Acceptance

1. A ~30 s sample clip (cursor, ripple, highlight, zoom, captions, narration, music) is reviewed
   by the user before full videos are made.
2. Each full video is watched end to end by the user; corrections go into the step scripts and
   the video is regenerated.
3. No real child data anywhere in the videos, the scripts, or the fake backup.

## Out of scope

- Uploading to YouTube (the user does it).
- A Shorts teaser.
- Separate per-chapter clips.
- English or other languages.
