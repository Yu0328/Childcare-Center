# 操作說明影片 + 拿掉密碼 — design

## 1. 拿掉密碼

The user asked to remove the password screen. It was a soft deterrent only (hash in the bundle,
nothing encrypted), so nothing real is lost. Removed: `src/auth/passwordGate.js` and its test,
`mountApp`'s unlock branch and `onUnlock` option, `wireBackupControls`' `updateLockState` lock on
the 備份 buttons, the build script wiring, and the 「為什麼開啟後要輸入密碼」 section of `about.html`.
The hosted build's sign-in choice screen (`gate`) still runs first, unchanged.

## 2. 影片教學 in 操作說明 — video first, text as backup

The user made two YouTube videos, which match the existing 手機版／電腦版 switch:

| Switch | Video | Id |
|---|---|---|
| 電腦版 | 育英公托填表系統｜完整操作教學（電腦版） | `OjBdyI0x72g` |
| 手機版 | 育英公托填表系統｜完整操作教學（手機版）(vertical) | `Tt7wcXTPkjg` |

Both descriptions carry a YouTube chapter list whose chapters are the help chapters
(開始使用 … 資料保存), so each help chapter maps to a start second (`HELP_VIDEOS` in
`src/ui/helpContent.js`).

Layout, top to bottom:

1. Header + 手機版／電腦版 switch (unchanged).
2. **影片教學** card: the player (16:9, or 9:16 for 手機版) beside a chapter list (time + chapter
   name); narrow screens stack them. The switch swaps the video.
3. **文字圖解說明** heading, then the existing chapter cards — now all closed at first (the video is
   the main way in). Each chapter the video covers starts with 「▶ 看影片的這一段」.

Playback:

- Web build: a cover (YouTube thumbnail + play button) until tapped, then a
  `youtube-nocookie.com` embed with autoplay — YouTube isn't loaded just by opening 操作說明.
  A chapter link or 看影片的這一段 reloads the embed at that second (`start=`); the latter also
  scrolls up to the player. No YouTube IFrame API — reloading at `start` is enough.
- Offline `TableC.html`: YouTube refuses to play an embed on a `file://` page, so the cover and
  every chapter link are plain links opening `youtu.be/<id>?t=<s>` in a new tab.
- CSP: `img-src https://i.ytimg.com` in both builds (thumbnail, a CSS background so it fails
  silently offline); `frame-src https://www.youtube-nocookie.com` in the web build only.

This replaces the "not embedded in 操作說明" line of `2026-10-24-demo-videos-design.md`, which was
about bundling video files; an embed bundles nothing.

## Acceptance

- `tests/helpView.test.js`: video follows the switch, chapter list times, offline links open
  YouTube at the time, web build embeds and jumps to a chapter.
- Built pages checked in a browser at desktop and phone widths.
