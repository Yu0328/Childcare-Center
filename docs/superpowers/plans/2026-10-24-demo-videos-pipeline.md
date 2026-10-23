# Demo videos — pipeline + 30 s sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-command pipeline (`npm run video -- <name>`) that turns a step script into a narrated, captioned, music-backed mp4 of the real app, proven on a ~30 s sample clip the user reviews (spec acceptance step 1).

**Architecture:** Narration is synthesized first (edge-tts, cached by text hash) so each step's duration is known. Playwright drives `dist/TableC.html` with an overlay script injected into the page (cursor, ripple, highlight ring, callout, captions, cards, zoom via CSS transform on `<body>`), while frames are captured through the CDP screencast at full quality. ffmpeg then turns the timestamped frames into constant-30 fps H.264 and lays narration clips + ducked, looped music under it, writing `.mp4`, `.srt` and a YouTube chapter list.

**Tech Stack:** Node (ESM `.mjs`), Playwright (`npm install --no-save playwright`, Chromium), `edge-tts` (Python, already installed), ffmpeg/ffprobe (already on PATH), vitest for the pure helpers.

**Scope:** Pipeline + `video/scripts/sample.mjs` only. The three real videos' step scripts (sales, desktop tutorial, phone tutorial) get their own plan after the user approves the sample — their content depends on that review.

Spec: `docs/superpowers/specs/2026-10-24-demo-videos-design.md`

## Global Constraints

- Voice `zh-TW-HsiaoChenNeural`, default rate `+0%`.
- Music file: `video/assets/music.mp3` ("From Here on In", 3:09). Never committed — `video/assets/` and `video/out/` are gitignored (already added to `.gitignore`).
- Desktop output 1920×1080; phone output 1080×1920.
- Fake data only — nothing from `references/`; fictional names like 王小明.
- Everything the pipeline writes goes under `video/out/`.
- Never commit the mp4/frames/tts cache.
- `package.json` has no `"type"`, so Node files use `.mjs`.

## File Structure

| File | Responsibility |
|---|---|
| `video/lib/timeline.mjs` | Pure helpers: tts cache key, caption chunking, SRT text, YouTube chapter text, frame durations. Unit-tested. |
| `tests/videoTimeline.test.js` | vitest tests for `timeline.mjs` |
| `video/lib/tts.mjs` | Synthesize one line with edge-tts (cached), probe duration |
| `video/lib/overlay.js` | Browser-side script defining `window.__demo` (cursor, ripple, ring, bubble, caption, card, chapter label, zoom) |
| `video/lib/recorder.mjs` | Launch Chromium, off-camera setup, screencast capture, run steps with the `d` helper API, return timeline |
| `video/lib/compose.mjs` | ffmpeg: frames → video, narration + ducked music → audio, mux; write srt + chapters |
| `video/make.mjs` | CLI entry: build app, tts all lines, record, compose |
| `video/scripts/sample.mjs` | ~30 s sample: intro card → 管理幼兒 → add 王小明 → zoom on result → outro |
| `package.json` | add `"video": "node video/make.mjs"` |

## Step script format (used by every later task)

```js
// video/scripts/<name>.mjs
export default {
  layout: 'desktop',            // 'desktop' | 'phone'
  steps: [
    { chapter: '管理幼兒',       // optional: sets corner label + YouTube chapter at this step
      say: '旁白文字。',          // optional: narration (also the captions)
      do: async d => { ... } },  // optional: actions, run concurrently with the narration
  ],
};
```

The step lasts `max(narration duration, do() duration) + 0.4 s`.

`d` helper API (defined in Task 4):
`d.click(sel)`, `d.type(sel, text)`, `d.select(sel, value)`, `d.highlight(sel, label?)`, `d.clearHighlight()`, `d.zoom(sel, scale = 1.8)`, `d.unzoom()`, `d.card(title, subtitle?)`, `d.hideCard()`, `d.wait(ms)`, `d.page` (raw Playwright page).

---

### Task 0: Worktree + commit spec

The spec, this plan and the `.gitignore` change are uncommitted on `main`, and `video/assets/music.mp3` lives in the main checkout (gitignored).

- [ ] **Step 1:** On `main`, commit the docs and gitignore:

```bash
git add docs/superpowers/specs/2026-10-24-demo-videos-design.md docs/superpowers/plans/2026-10-24-demo-videos-pipeline.md .gitignore
git commit -m "docs: demo videos design and pipeline plan"
```

- [ ] **Step 2:** Create the worktree and copy the music into it:

```bash
git worktree add .claude/worktrees/demo-videos -b demo-videos
mkdir -p .claude/worktrees/demo-videos/video/assets
cp video/assets/music.mp3 .claude/worktrees/demo-videos/video/assets/music.mp3
cd .claude/worktrees/demo-videos && npm install && npm install --no-save playwright
```

All later tasks run inside `.claude/worktrees/demo-videos`. Run tests with `npx vitest run tests/` (scoped, see CLAUDE.md).

---

### Task 1: Pure timeline helpers

**Files:**
- Create: `video/lib/timeline.mjs`
- Test: `tests/videoTimeline.test.js`

**Interfaces:**
- Produces:
  - `ttsKey(voice: string, rate: string, text: string): string` — 16 hex chars
  - `splitCaption(text: string, start: number, duration: number): {text, start, end}[]`
  - `toSrt(cues: {text, start, end}[]): string`
  - `toChapters(chapters: {title, start}[]): string`
  - `frameDurations(times: number[], end: number): number[]`

- [ ] **Step 1: Write the failing tests**

```js
// tests/videoTimeline.test.js
import { describe, it, expect } from 'vitest';
import { ttsKey, splitCaption, toSrt, toChapters, frameDurations } from '../video/lib/timeline.mjs';

describe('ttsKey', () => {
  it('is stable and changes with voice, rate or text', () => {
    const k = ttsKey('v', '+0%', '你好');
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(ttsKey('v', '+0%', '你好')).toBe(k);
    expect(ttsKey('w', '+0%', '你好')).not.toBe(k);
    expect(ttsKey('v', '+10%', '你好')).not.toBe(k);
    expect(ttsKey('v', '+0%', '你好。')).not.toBe(k);
  });
});

describe('splitCaption', () => {
  it('keeps a short line as one cue spanning the whole duration', () => {
    expect(splitCaption('點這裡新增幼兒。', 2, 3)).toEqual([{ text: '點這裡新增幼兒。', start: 2, end: 5 }]);
  });

  it('splits on sentence ends and shares time by length', () => {
    const cues = splitCaption('一二三。四五六七八九。', 0, 10);
    expect(cues.map(c => c.text)).toEqual(['一二三。', '四五六七八九。']);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBeCloseTo(4, 5); // 4 of 11 chars
    expect(cues[1].start).toBeCloseTo(4, 5);
    expect(cues[1].end).toBe(10);
  });

  it('breaks a sentence longer than 28 chars at commas', () => {
    const long = `${'甲'.repeat(20)}，${'乙'.repeat(20)}。`;
    expect(splitCaption(long, 0, 4).map(c => c.text)).toEqual([`${'甲'.repeat(20)}，`, `${'乙'.repeat(20)}。`]);
  });
});

describe('toSrt', () => {
  it('numbers cues and formats hh:mm:ss,mmm', () => {
    expect(toSrt([
      { text: '甲', start: 0, end: 1.5 },
      { text: '乙', start: 61.25, end: 3725.004 },
    ])).toBe('1\n00:00:00,000 --> 00:00:01,500\n甲\n\n2\n00:01:01,250 --> 01:02:05,004\n乙\n');
  });
});

describe('toChapters', () => {
  it('prepends 0:00 片頭 when the first chapter starts later', () => {
    expect(toChapters([{ title: '管理幼兒', start: 12.7 }, { title: '月計畫', start: 75 }]))
      .toBe('0:00 片頭\n0:12 管理幼兒\n1:15 月計畫');
  });

  it('uses h:mm:ss past an hour and does not duplicate 0:00', () => {
    expect(toChapters([{ title: '開始使用', start: 0 }, { title: '尾', start: 3661 }]))
      .toBe('0:00 開始使用\n1:01:01 尾');
  });
});

describe('frameDurations', () => {
  it('gives each frame the gap to the next, and the last frame the gap to the end', () => {
    expect(frameDurations([0, 0.5, 2], 3)).toEqual([0.5, 1.5, 1]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/videoTimeline.test.js`
Expected: FAIL — cannot resolve `../video/lib/timeline.mjs`.

- [ ] **Step 3: Implement**

```js
// video/lib/timeline.mjs
import { createHash } from 'node:crypto';

export function ttsKey(voice, rate, text) {
  return createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 16);
}

const MAX_CAPTION_CHARS = 28;

// One cue per sentence; a sentence too long for one caption line is packed at its commas.
// Time is shared by character count, since narration speed is roughly constant per character.
export function splitCaption(text, start, duration) {
  const pieces = [];
  for (const sentence of text.split(/(?<=[。！？；])/).filter(Boolean)) {
    if (sentence.length <= MAX_CAPTION_CHARS) { pieces.push(sentence); continue; }
    let current = '';
    for (const part of sentence.split(/(?<=[，、])/)) {
      if (current && current.length + part.length > MAX_CAPTION_CHARS) { pieces.push(current); current = ''; }
      current += part;
    }
    if (current) pieces.push(current);
  }
  const total = pieces.reduce((sum, p) => sum + p.length, 0);
  let t = start;
  return pieces.map((p, i) => {
    const end = i === pieces.length - 1 ? start + duration : t + (duration * p.length) / total;
    const cue = { text: p, start: t, end };
    t = end;
    return cue;
  });
}

const pad2 = n => String(n).padStart(2, '0');

function srtTime(sec) {
  const ms = Math.round(sec * 1000);
  return `${pad2(Math.floor(ms / 3600000))}:${pad2(Math.floor(ms / 60000) % 60)}:${pad2(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, '0')}`;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

function chapterTime(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}

// YouTube only builds chapters when the list starts at 0:00.
export function toChapters(chapters) {
  const list = chapters.length && Math.floor(chapters[0].start) === 0 ? chapters : [{ title: '片頭', start: 0 }, ...chapters];
  return list.map(c => `${chapterTime(c.start)} ${c.title}`).join('\n');
}

export function frameDurations(times, end) {
  return times.map((t, i) => (i + 1 < times.length ? times[i + 1] : end) - t);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/videoTimeline.test.js`
Expected: PASS (all 8 tests). Then `npx vitest run tests/` — whole suite still green.

- [ ] **Step 5: Commit**

```bash
git add video/lib/timeline.mjs tests/videoTimeline.test.js
git commit -m "feat(video): timeline helpers — tts key, captions, srt, chapters"
```

---

### Task 2: TTS wrapper

**Files:**
- Create: `video/lib/tts.mjs`

**Interfaces:**
- Consumes: `ttsKey` (Task 1)
- Produces: `VOICE`, `synth(text: string, { dir: string, rate?: string }): { file: string, duration: number }`, `probeDuration(file: string): number`

- [ ] **Step 1: Implement**

```js
// video/lib/tts.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ttsKey } from './timeline.mjs';

export const VOICE = 'zh-TW-HsiaoChenNeural';

export function probeDuration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

// Cached by voice+rate+text, so re-running a video only re-synthesizes lines that changed.
export function synth(text, { dir, rate = '+0%' }) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${ttsKey(VOICE, rate, text)}.mp3`);
  if (!existsSync(file)) {
    execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, `--rate=${rate}`, '--text', text, '--write-media', file], { stdio: 'inherit' });
  }
  return { file, duration: probeDuration(file) };
}
```

- [ ] **Step 2: Smoke check (needs network)**

Run:
```bash
node -e "import('./video/lib/tts.mjs').then(m => { const a = m.synth('測試一下。', { dir: 'video/out/tts' }); const b = m.synth('測試一下。', { dir: 'video/out/tts' }); console.log(a, a.file === b.file); })"
```
Expected: prints `{ file: 'video/out/tts/<16hex>.mp3', duration: ~1.x }` and `true`; the second call returns instantly (cached).

- [ ] **Step 3: Commit**

```bash
git add video/lib/tts.mjs
git commit -m "feat(video): cached edge-tts narration"
```

---

### Task 3: Overlay layer (browser side)

**Files:**
- Create: `video/lib/overlay.js`

**Interfaces:**
- Produces (in the page): `window.__demo` with
  - `moveTo(x, y, ms): Promise<void>` — cursor glides to viewport point
  - `ripple(x, y): void`
  - `ring(rect: {x,y,width,height}, label?: string): void`, `clearRing(): void`
  - `caption(text: string): void` (empty string hides)
  - `card(title: string, subtitle?: string): void`, `hideCard(): Promise<void>`
  - `chapter(text: string): void` (corner label; empty hides)
  - `zoom(rect, scale, ms): Promise<void>`, `unzoom(ms): Promise<void>`

The layer is appended to `<html>`, not `<body>`, so zooming `<body>` doesn't scale the cursor, captions or cards. Colors from `src/styles.css` (`--brand: #2a78d6`).

- [ ] **Step 1: Implement**

```js
// video/lib/overlay.js — injected into the page by recorder.mjs (addInitScript), defines window.__demo.
(() => {
  const BRAND = '#2a78d6';
  const css = `
    #demo-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: "Microsoft JhengHei", system-ui, sans-serif; }
    #demo-layer .cursor { position: fixed; left: 0; top: 0; width: 28px; height: 28px; margin: -4px 0 0 -4px; transition-property: left, top; transition-timing-function: cubic-bezier(.4,0,.2,1);
      background: no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l16 11-7 1.5L9.5 21z' fill='%23fff' stroke='%23222' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E");
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); }
    #demo-layer .ripple { position: fixed; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 3px solid ${BRAND}; animation: demo-ripple .6s ease-out forwards; }
    @keyframes demo-ripple { to { transform: scale(4); opacity: 0; } }
    #demo-layer .ring { position: fixed; border-radius: 12px; box-shadow: 0 0 0 4px ${BRAND}, 0 0 24px 6px rgba(42,120,214,.45); opacity: 0; transition: opacity .3s; }
    #demo-layer .ring.on { opacity: 1; }
    #demo-layer .bubble { position: fixed; max-width: 360px; padding: 10px 16px; border-radius: 10px; background: ${BRAND}; color: #fff; font-size: 22px; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,.2); opacity: 0; transform: translateY(6px); transition: opacity .3s, transform .3s; }
    #demo-layer .bubble.on { opacity: 1; transform: none; }
    #demo-layer .caption { position: fixed; left: 50%; bottom: 6%; transform: translateX(-50%); max-width: 86%; padding: 12px 28px; border-radius: 12px; background: rgba(20,24,22,.78); color: #fff; font-size: 34px; line-height: 1.45; text-align: center; opacity: 0; transition: opacity .2s; }
    #demo-layer .caption.on { opacity: 1; }
    #demo-layer.phone .caption { bottom: 16%; font-size: 30px; }
    #demo-layer .chapter { position: fixed; top: 20px; right: 24px; padding: 6px 16px; border-radius: 999px; background: rgba(255,255,255,.92); color: ${BRAND}; font-size: 20px; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.12); opacity: 0; transition: opacity .3s; }
    #demo-layer .chapter.on { opacity: 1; }
    #demo-layer .card { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: linear-gradient(135deg, #f4f4f1, #dceafb); color: #1f2422; opacity: 0; transition: opacity .6s; }
    #demo-layer .card.on { opacity: 1; }
    #demo-layer .card h1 { margin: 0; font-size: 64px; color: #1c5cab; text-align: center; padding: 0 40px; }
    #demo-layer .card p { margin: 0; font-size: 30px; color: #55605c; text-align: center; padding: 0 40px; }
  `;
  let layer;
  const $ = sel => layer.querySelector(sel);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function ensure() {
    if (layer) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    layer = document.createElement('div');
    layer.id = 'demo-layer';
    if (innerWidth < innerHeight) layer.classList.add('phone');
    layer.innerHTML = '<div class="card"><h1></h1><p></p></div><div class="ring"></div><div class="bubble"></div><div class="chapter"></div><div class="caption"></div><div class="cursor"></div>';
    document.documentElement.appendChild(layer);
    Object.assign($('.cursor').style, { left: `${innerWidth * 0.6}px`, top: `${innerHeight * 0.6}px` });
  }

  // Current body transform, so a zoom can be measured from unzoomed coordinates.
  let view = { tx: 0, ty: 0, s: 1 };
  function applyView(ms) {
    document.body.style.transformOrigin = '0 0';
    document.body.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
    document.body.style.transform = view.s === 1 ? '' : `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
    return sleep(ms);
  }

  window.__demo = {
    moveTo(x, y, ms) {
      ensure();
      const c = $('.cursor');
      c.style.transitionDuration = `${ms}ms`;
      Object.assign(c.style, { left: `${x}px`, top: `${y}px` });
      return sleep(ms);
    },
    ripple(x, y) {
      ensure();
      const r = document.createElement('div');
      r.className = 'ripple';
      Object.assign(r.style, { left: `${x}px`, top: `${y}px` });
      layer.appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
    ring(rect, label) {
      ensure();
      const pad = 8;
      Object.assign($('.ring').style, { left: `${rect.x - pad}px`, top: `${rect.y - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
      $('.ring').classList.add('on');
      const b = $('.bubble');
      if (!label) { b.classList.remove('on'); return; }
      b.textContent = label;
      // Below the target if there is room, else above; clamped inside the viewport.
      const below = rect.y + rect.height + pad + 16;
      b.style.left = `${Math.max(16, Math.min(rect.x, innerWidth - 376))}px`;
      b.style.top = below + 60 < innerHeight ? `${below}px` : `${Math.max(16, rect.y - pad - 70)}px`;
      b.classList.add('on');
    },
    clearRing() {
      ensure();
      $('.ring').classList.remove('on');
      $('.bubble').classList.remove('on');
    },
    caption(text) {
      ensure();
      const c = $('.caption');
      if (text) c.textContent = text;
      c.classList.toggle('on', Boolean(text));
    },
    card(title, subtitle = '') {
      ensure();
      $('.card h1').textContent = title;
      $('.card p').textContent = subtitle;
      $('.card').classList.add('on');
    },
    hideCard() {
      ensure();
      $('.card').classList.remove('on');
      return sleep(600);
    },
    chapter(text) {
      ensure();
      const c = $('.chapter');
      if (text) c.textContent = text;
      c.classList.toggle('on', Boolean(text));
    },
    // Scales <body> about the target's centre, clamped so no page edge comes into view.
    // ponytail: assumes no scrolling while zoomed; unzoom before scrolling.
    zoom(rect, s, ms) {
      ensure();
      const cx = (rect.x + rect.width / 2 - view.tx) / view.s + scrollX;
      const cy = (rect.y + rect.height / 2 - view.ty) / view.s + scrollY;
      const W = document.body.scrollWidth;
      const H = document.body.scrollHeight;
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      view = {
        s,
        tx: clamp(innerWidth / 2 + scrollX - s * cx, scrollX + innerWidth - s * W, scrollX),
        ty: clamp(innerHeight / 2 + scrollY - s * cy, scrollY + innerHeight - s * H, scrollY),
      };
      return applyView(ms);
    },
    unzoom(ms) {
      view = { tx: 0, ty: 0, s: 1 };
      return applyView(ms);
    },
  };
})();
```

- [ ] **Step 2: Manual check**

Run:
```bash
npm run build
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, bypassCSP: true });
  await p.addInitScript({ path: 'video/lib/overlay.js' });
  await p.goto('file://' + process.cwd().replace(/\\\\/g, '/') + '/dist/TableC.html');
  await p.evaluate(async () => { __demo.caption('字幕測試：點這裡新增幼兒。'); __demo.chapter('管理幼兒'); __demo.ring({ x: 800, y: 400, width: 300, height: 80 }, '點這裡'); await __demo.moveTo(950, 440, 300); });
  await p.screenshot({ path: 'video/out/overlay-check.png' });
  await b.close();
})();"
```
Open `video/out/overlay-check.png`. Expected: caption bar bottom-centre, chapter pill top-right, glowing ring with blue bubble below it, cursor inside the ring. (Page shows the password gate — fine; unlock is Task 4.)

- [ ] **Step 3: Commit**

```bash
git add video/lib/overlay.js
git commit -m "feat(video): in-page overlay — cursor, ripple, ring, captions, cards, zoom"
```

---

### Task 4: Recorder

**Files:**
- Create: `video/lib/recorder.mjs`

**Interfaces:**
- Consumes: `window.__demo` (Task 3), `splitCaption` (Task 1); step format above. Each step arrives with `audio: { file, duration } | undefined` attached by `make.mjs` (Task 6).
- Produces: `record({ layout, steps, framesDir, appUrl }): Promise<{ frames: {file, t}[], end: number, clips: {file, start}[], cues: {text, start, end}[], chapters: {title, start}[] }>` — all times in seconds from the first frame.

Notes for the implementer:
- `dist/TableC.html` has a strict CSP (`script-src` by hash only) — the context needs `bypassCSP: true`.
- The password gate is skipped off camera by pre-setting `localStorage['c-form-unlocked']` to the hash read from `src/auth/passwordGate.js` (same thing `unlock()` does).
- Frame times use `Date.now()` at frame arrival — the same clock as the step timeline, so audio and video line up without converting CDP timestamps.
- Phone: viewport 412×732 at `deviceScaleFactor` 1080/412 gives 1080×1920 frames; `isMobile`/`hasTouch` so the app picks its mobile layout (≤640 px breakpoint).

- [ ] **Step 1: Implement**

```js
// video/lib/recorder.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { splitCaption } from './timeline.mjs';

const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, out: { w: 1920, h: 1080 } },
  phone: { viewport: { width: 412, height: 732 }, deviceScaleFactor: 1080 / 412, isMobile: true, hasTouch: true, out: { w: 1080, h: 1920 } },
};
const STEP_GAP_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function unlockHash() {
  return readFileSync('src/auth/passwordGate.js', 'utf-8').match(/PASSWORD_HASH\s*=\s*'([0-9a-f]{64})'/)[1];
}

function helpers(page) {
  const demo = (fn, ...args) => page.evaluate(([name, a]) => window.__demo[name](...a), [fn, args]);
  async function target(sel) {
    const loc = page.locator(sel).first();
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    return { loc, box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async function pointAt(sel) {
    const t = await target(sel);
    await demo('moveTo', t.x, t.y, 700);
    return t;
  }
  return {
    page,
    wait: ms => sleep(ms),
    async click(sel) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.click();
      await sleep(300);
    },
    async type(sel, text) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.click();
      await t.loc.pressSequentially(text, { delay: 120 });
    },
    async select(sel, value) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.selectOption(value);
      await sleep(300);
    },
    async highlight(sel, label) {
      const { box } = await target(sel);
      await demo('ring', box, label);
    },
    clearHighlight: () => demo('clearRing'),
    async zoom(sel, scale = 1.8) {
      const { box } = await target(sel);
      await demo('zoom', box, scale, 900);
    },
    unzoom: () => demo('unzoom', 900),
    card: (title, subtitle) => demo('card', title, subtitle),
    hideCard: () => demo('hideCard'),
  };
}

export async function record({ layout, steps, framesDir, appUrl }) {
  const cfg = LAYOUTS[layout];
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch();
  const { out, ...contextOptions } = cfg;
  const context = await browser.newContext({ ...contextOptions, bypassCSP: true });
  const hash = unlockHash();
  await context.addInitScript(h => localStorage.setItem('c-form-unlocked', h), hash);
  await context.addInitScript({ path: 'video/lib/overlay.js' });
  const page = await context.newPage();
  await page.goto(appUrl);
  await page.waitForSelector('[data-action="manage-children"]');
  const d = helpers(page);

  // Frames: CDP screencast at full quality; each frame stamped on arrival.
  const cdp = await context.newCDPSession(page);
  const frames = [];
  let t0 = null;
  const now = () => Date.now() / 1000 - t0;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    if (t0 === null) t0 = Date.now() / 1000;
    const file = join(framesDir, `${String(frames.length).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: now() });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: out.w, maxHeight: out.h, everyNthFrame: 1 });
  while (t0 === null) await sleep(20);

  const clips = [];
  const cues = [];
  const chapters = [];
  for (const step of steps) {
    const start = now();
    if (step.chapter) {
      chapters.push({ title: step.chapter, start });
      await d.page.evaluate(text => window.__demo.chapter(text), step.chapter);
    }
    const waits = [step.do ? step.do(d) : Promise.resolve()];
    if (step.audio) {
      clips.push({ file: step.audio.file, start });
      for (const cue of splitCaption(step.say, start, step.audio.duration)) {
        cues.push(cue);
        waits.push(sleep((cue.start - start) * 1000).then(() => page.evaluate(text => window.__demo.caption(text), cue.text)));
      }
      waits.push(sleep(step.audio.duration * 1000));
    }
    await Promise.all(waits);
    await page.evaluate(() => window.__demo.caption(''));
    await sleep(STEP_GAP_MS);
  }

  await sleep(500);
  const end = now();
  await cdp.send('Page.stopScreencast');
  await browser.close();
  return { frames, end, clips, cues, chapters };
}
```

- [ ] **Step 2: Commit** (exercised end-to-end in Task 6)

```bash
git add video/lib/recorder.mjs
git commit -m "feat(video): recorder — screencast capture, narration-paced steps, helper API"
```

---

### Task 5: Composer

**Files:**
- Create: `video/lib/compose.mjs`

**Interfaces:**
- Consumes: `record()` result (Task 4), `frameDurations`, `toSrt`, `toChapters` (Task 1), `probeDuration` (Task 2)
- Produces: `compose({ name, rec, outDir, music }): { mp4, srt, chapters }` — paths written

ffmpeg graph: narration clips each `adelay`ed to their start and `amix`ed into `[voice]`; music looped (`-stream_loop -1`), lowered, ducked under `[voice]` with `sidechaincompress`, faded in/out; both mixed, trimmed to the video length.

- [ ] **Step 1: Implement**

```js
// video/lib/compose.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { frameDurations, toSrt, toChapters } from './timeline.mjs';

const MUSIC_VOLUME = 0.22;

export function compose({ name, rec, outDir, music }) {
  mkdirSync(outDir, { recursive: true });
  const D = rec.end.toFixed(3);

  // Frames → concat list (variable frame times), re-timed to constant 30 fps below.
  const durations = frameDurations(rec.frames.map(f => f.t), rec.end);
  const lines = rec.frames.flatMap((f, i) => [`file '${resolve(f.file).replace(/\\/g, '/')}'`, `duration ${durations[i].toFixed(4)}`]);
  lines.push(`file '${resolve(rec.frames.at(-1).file).replace(/\\/g, '/')}'`); // concat demuxer drops the last duration otherwise
  const listFile = join(outDir, `${name}-frames.txt`);
  writeFileSync(listFile, lines.join('\n'));

  // ponytail: every narration clip is its own ffmpeg input; ~400 clips hits the Windows
  // command-line limit — pre-mix narration into one wav first if a script gets that long.
  const inputs = ['-f', 'concat', '-safe', '0', '-i', listFile, '-stream_loop', '-1', '-i', music];
  rec.clips.forEach(c => inputs.push('-i', c.file));
  const voiceParts = rec.clips.map((c, i) => {
    const ms = Math.round(c.start * 1000);
    return `[${i + 2}:a]adelay=${ms}|${ms}[v${i}]`;
  });
  const graph = [
    ...voiceParts,
    `${rec.clips.map((_, i) => `[v${i}]`).join('')}amix=inputs=${rec.clips.length}:normalize=0,asplit[voice][key]`,
    `[1:a]volume=${MUSIC_VOLUME},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, rec.end - 3).toFixed(3)}:d=3[music]`,
    `[music][key]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=500[ducked]`,
    `[voice][ducked]amix=inputs=2:normalize=0,atrim=0:${D}[aout]`,
    `[0:v]fps=30,format=yuv420p[vout]`,
  ].join(';');
  const graphFile = join(outDir, `${name}-graph.txt`);
  writeFileSync(graphFile, graph);

  const mp4 = join(outDir, `${name}.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-v', 'warning', ...inputs,
    '-filter_complex_script', graphFile, '-map', '[vout]', '-map', '[aout]',
    '-t', D, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4,
  ], { stdio: 'inherit' });

  const srt = join(outDir, `${name}.srt`);
  writeFileSync(srt, toSrt(rec.cues));
  const chapters = join(outDir, `${name}-chapters.txt`);
  writeFileSync(chapters, toChapters(rec.chapters));
  return { mp4, srt, chapters };
}
```

- [ ] **Step 2: Commit** (exercised end-to-end in Task 6)

```bash
git add video/lib/compose.mjs
git commit -m "feat(video): compose frames, narration and ducked music into mp4 + srt + chapters"
```

---

### Task 6: CLI + sample script, end to end

**Files:**
- Create: `video/make.mjs`, `video/scripts/sample.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `synth` (Task 2), `record` (Task 4), `compose` (Task 5)
- Produces: `npm run video -- <name>` → `video/out/<name>.mp4`, `.srt`, `-chapters.txt`

- [ ] **Step 1: Write `video/make.mjs`**

```js
// video/make.mjs — usage: npm run video -- <script name in video/scripts/>
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { synth } from './lib/tts.mjs';
import { record } from './lib/recorder.mjs';
import { compose } from './lib/compose.mjs';

const name = process.argv[2];
if (!name) { console.error('usage: npm run video -- <name>'); process.exit(1); }
const script = (await import(pathToFileURL(resolve('video/scripts', `${name}.mjs`)).href)).default;

execSync('npm run build', { stdio: 'inherit' });
const steps = script.steps.map(step => ({ ...step, audio: step.say ? synth(step.say, { dir: 'video/out/tts' }) : undefined }));
console.log('recording…');
const rec = await record({ layout: script.layout, steps, framesDir: `video/out/frames-${name}`, appUrl: pathToFileURL(resolve('dist/TableC.html')).href });
console.log(`recorded ${rec.frames.length} frames over ${rec.end.toFixed(1)} s (${(rec.frames.length / rec.end).toFixed(1)} fps captured)`);
const out = compose({ name, rec, outDir: 'video/out', music: 'video/assets/music.mp3' });
console.log(out);
```

- [ ] **Step 2: Add the npm script** — in `package.json` `"scripts"`, after `"build:web"`:

```json
"video": "node video/make.mjs"
```

- [ ] **Step 3: Write `video/scripts/sample.mjs`**

Selectors are from `src/ui/reportTypeSelectView.js` (`manage-children`) and `src/ui/childListView.js` (`add-child` form; on desktop its popup is already open). Birth-date selects hold Gregorian values (`src/ui/birthDateField.js`).

```js
// video/scripts/sample.mjs — ~30 s style sample for user review (spec acceptance step 1).
const form = '[data-action="add-child"]';

export default {
  layout: 'desktop',
  steps: [
    {
      say: '歡迎使用育英公托填表系統。',
      do: async d => { await d.card('育英公托填表系統', '適性紀錄・課程月計畫・適性總表'); },
    },
    { do: async d => { await d.hideCard(); } },
    {
      chapter: '管理幼兒',
      say: '首先，在首頁點選「管理幼兒」。',
      do: async d => {
        await d.highlight('[data-action="manage-children"]', '點這裡');
        await d.wait(900);
        await d.clearHighlight();
        await d.click('[data-action="manage-children"]');
      },
    },
    {
      say: '輸入幼兒的姓名和出生日期，系統會依年齡自動判斷適用的階段。',
      do: async d => {
        await d.zoom(form, 1.7);
        await d.type(`${form} [data-field="name"]`, '王小明');
        await d.select(`${form} [data-field="birthDate-year"]`, '2025');
        await d.select(`${form} [data-field="birthDate-month"]`, '3');
        await d.select(`${form} [data-field="birthDate-day"]`, '15');
      },
    },
    {
      say: '最後按下「新增」就完成了。',
      do: async d => {
        await d.click(`${form} button[type="submit"]`);
        await d.unzoom();
      },
    },
    {
      say: '新增好的幼兒，會出現在這個清單裡。',
      do: async d => {
        await d.highlight('[data-child-id]', '王小明已加入');
        await d.wait(1500);
        await d.clearHighlight();
      },
    },
    {
      say: '感謝收看。',
      do: async d => { await d.card('感謝收看', '育英公托填表系統'); },
    },
  ],
};
```

Option values are unpadded Gregorian numbers (`'2025'`, `'3'`, `'15'`), per `birthDateSelectsHtml`.

- [ ] **Step 4: Run end to end**

Run: `npm run video -- sample`
Expected:
- the build line, edge-tts progress for 6 lines, `recording…`
- `recorded N frames over ~30 s (≥ 20 fps captured)` — if fps is well under 20, add `everyNthFrame` tuning or lower JPEG `quality` to 85 in `recorder.mjs` and re-run
- a printed `{ mp4, srt, chapters }` with `video/out/sample.mp4`

- [ ] **Step 5: Verify the output**

```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate -show_entries format=duration -of compact video/out/sample.mp4
cat video/out/sample-chapters.txt
head -12 video/out/sample.srt
```
Expected: video 1920×1080 at 30/1, an aac audio stream, duration ≈ recorded seconds; chapters `0:00 片頭` then `0:0x 管理幼兒`; srt cues in order.

Then watch `video/out/sample.mp4` (`start video/out/sample.mp4`) and check:
- small text sharp (not the blur `recordVideo` would give)
- captions appear with their spoken line, not before/after
- cursor glides, ripple on each click, zoom eases in on the form and back out
- music audible but clearly under the voice, dipping while she speaks, fading at the end
- final frame shows 王小明 in the list

Fix anything off (timing constants in `recorder.mjs`, CSS in `overlay.js`, `MUSIC_VOLUME`/sidechain values in `compose.mjs`) and re-run — TTS is cached, so re-runs are fast.

- [ ] **Step 6: Commit**

```bash
git add video/make.mjs video/scripts/sample.mjs package.json
git commit -m "feat(video): npm run video CLI and 30 s style sample"
```

- [ ] **Step 7: Phone smoke check**

Scripts load from `video/scripts/`, so make a throwaway phone copy there, run it, then delete it:

```bash
sed "s/layout: 'desktop'/layout: 'phone'/" video/scripts/sample.mjs > video/scripts/sample-phone.mjs
npm run video -- sample-phone
ffprobe -v error -show_entries stream=width,height -of csv=p=0 video/out/sample-phone.mp4
rm video/scripts/sample-phone.mjs
```
Expected: `1080,1920`; the app is in its mobile layout. On phone the add-child form sits behind the ＋ button (`[data-action="open-form-popup"]`), so this sample's form steps will fail there — that's expected; only confirm the vertical frame size, mobile layout and caption position here. The phone tutorial script (next plan) opens the popup first.

---

### Task 7: Hand the sample to the user

- [ ] **Step 1:** Report to the user (in 繁體中文, plain language): where `video/out/sample.mp4` is, what to look at (sharpness, cursor/zoom feel, caption size, voice/music balance), and ask for changes.
- [ ] **Step 2:** Apply feedback, re-run `npm run video -- sample`, repeat until approved.
- [ ] **Step 3:** Once approved, write the next plan (sales, desktop tutorial, phone tutorial step scripts, fake-data seeding, `video:sales`/`video:desktop`/`video:phone` npm scripts) from the spec.

Do not merge `demo-videos` into `main` until the full videos exist — the branch stays open across both plans.
