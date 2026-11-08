// Drives the 育英 web build with the overlay injected, Google faked, demo data seeded off camera,
// and frames captured through the CDP screencast. Times are seconds from the first frame.
import { chromium } from 'playwright';
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { splitCaption } from './timeline.mjs';
import { createFakeDrive } from './fakeDrive.mjs';

const LAYOUTS = {
  // 1440 CSS px drawn at 4/3: the same 1920×1080 frame with text a third larger.
  desktop: { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, out: { w: 1920, h: 1080 } },
  phone: { viewport: { width: 412, height: 732 }, deviceScaleFactor: 1080 / 412, isMobile: true, hasTouch: true, out: { w: 1080, h: 1920 } },
};
const STEP_GAP_MS = 400;
const WAIT_MS = 10000;
export const IMPORT_DOCX = 'video/out/fixtures/陳小華-D表-115年09月.docx';
export const RECORDING_TIME = '2026-11-16T09:30:00+08:00';
const NOTICE_KEYS = ['c-form-monthly-plan-per-child-notice'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function seedBundle() {
  const result = await esbuild.build({
    entryPoints: ['video/seed/seedEntry.js'], bundle: true, format: 'iife', globalName: '__seed', write: false,
    define: {
      __CENTER_ID__: '"yuying"',
      __CENTER_BADGE__: JSON.stringify(readFileSync('assets/centers/yuying/word-badge.png').toString('base64')),
    },
  });
  return result.outputFiles[0].text;
}

// Placeholder 點滴分享 photos (drawn, no real child), written once to video/assets/photos/.
export const PHOTOS = ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(f => `video/assets/photos/${f}`);
const PHOTO_SCENES = [
  ['#ffe3b3', '#ffb86b', '🧱', '積木時間'],
  ['#d6f0ff', '#8cc8ff', '🎨', '塗鴉創作'],
  ['#dff5d8', '#9ed98a', '🌳', '戶外散步'],
];
async function drawPhotos(context) {
  if (PHOTOS.every(existsSync)) return;
  mkdirSync('video/assets/photos', { recursive: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 800, height: 600 });
  for (const [i, [a, b, icon, text]] of PHOTO_SCENES.entries()) {
    await page.setContent(`<body style="margin:0;width:800px;height:600px;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:linear-gradient(135deg,${a},${b});font-family:'Microsoft JhengHei',sans-serif">
      <div style="font-size:200px;line-height:1">${icon}</div><div style="margin-top:24px;font-size:48px;color:#3a3a3a">${text}</div>
      <div style="position:absolute;bottom:20px;right:28px;font-size:22px;color:rgba(0,0,0,.45)">示範照片</div></body>`);
    await page.screenshot({ path: PHOTOS[i], type: 'jpeg', quality: 90 });
  }
  await page.close();
}

async function routeEverything(context, appOrigin, drive, unhandled) {
  const gis = readFileSync('video/lib/fakeGis.js', 'utf-8');
  await context.route('**/*', async route => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin === appOrigin || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    if (u.href.startsWith('https://accounts.google.com/gsi/client')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: gis });
    }
    if (u.href.startsWith('https://www.googleapis.com/oauth2/v3/userinfo')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: '育英老師', given_name: '育英老師' }) });
    }
    if (u.hostname === 'www.googleapis.com' && (u.pathname.startsWith('/drive/') || u.pathname.startsWith('/upload/drive/'))) {
      const res = drive.handle({ method: req.method(), url: req.url(), headers: req.headers(), body: req.postDataBuffer() });
      return route.fulfill({ status: res.status, contentType: res.contentType, body: res.body, headers: { Date: new Date().toUTCString() } });
    }
    unhandled.push(`${req.method()} ${req.url()}`);
    return route.abort();
  });
}

function helpers(page) {
  const demo = (fn, ...args) => page.evaluate(([name, a]) => window.__demo[name](...a), [fn, args]);
  async function target(sel) {
    let loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: 'attached', timeout: WAIT_MS });
      // A checkbox/radio inside a <label> (often styled through it, the input itself hidden or
      // covered): aim at the label, as a person would.
      if (await loc.evaluate(el => el.matches('input[type="checkbox"], input[type="radio"]') && Boolean(el.closest('label')))) {
        loc = loc.locator('xpath=ancestor::label[1]');
      }
      await loc.waitFor({ state: 'visible', timeout: WAIT_MS });
    } catch {
      throw new Error(`selector not visible within ${WAIT_MS} ms: ${sel}`);
    }
    // Off screen or under the caption: glide it to the middle instead of jumping there.
    const moved = await loc.evaluate(el => {
      if (document.body.style.transform) return false; // zoomed: scrolling would misplace the zoom
      const r = el.getBoundingClientRect();
      const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      if (r.top >= header + 8 && r.bottom <= innerHeight * 0.78) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return new Promise(resolve => setTimeout(() => resolve(true), 750));
    });
    if (moved) await sleep(50);
    const box = await loc.boundingBox();
    await demo('avoid', box);
    return { loc, box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async function pointAt(sel) {
    const t = await target(sel);
    await demo('moveTo', t.x, t.y, 700);
    return t;
  }
  return {
    page,
    target,
    wait: ms => sleep(ms),
    async click(sel) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.click();
      await sleep(300);
    },
    async doubleClick(sel) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.dblclick();
      await sleep(300);
    },
    async type(sel, text) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.click();
      await t.loc.pressSequentially(text, { delay: 120 });
    },
    async fill(sel, text) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.fill(text);
    },
    async select(sel, value) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      await t.loc.selectOption(value);
      await sleep(300);
    },
    // The OS file chooser is never shown: point at the visible picker, then hand the input its files.
    async setFiles(buttonSel, inputSel, paths) {
      const t = await pointAt(buttonSel);
      await demo('ripple', t.x, t.y);
      await page.locator(inputSel).first().setInputFiles(paths);
      await sleep(300);
    },
    async drag(fromSel, toSel) {
      const from = await pointAt(fromSel);
      const to = await target(toSel);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      const steps = 24;
      for (let i = 1; i <= steps; i += 1) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await page.mouse.move(x, y);
        await page.evaluate(([px, py]) => window.__demo.moveTo(px, py, 0), [x, y]);
        await sleep(800 / steps);
      }
      await page.mouse.up();
      await sleep(300);
    },
    // For a click that opens the browser's confirm(): the first click is answered 取消 to learn the
    // message, the drawn box is shown and 確定 pressed, then the click is repeated and accepted.
    async clickConfirm(sel) {
      const t = await pointAt(sel);
      await demo('ripple', t.x, t.y);
      const message = new Promise(resolve => page.once('dialog', dialog => { resolve(dialog.message()); dialog.dismiss(); }));
      await t.loc.click();
      const ok = await demo('confirm', await message);
      await sleep(1400);
      await demo('moveTo', ok.x, ok.y, 600);
      await demo('ripple', ok.x, ok.y);
      await sleep(250);
      await demo('hideConfirm');
      page.once('dialog', dialog => dialog.accept());
      await t.loc.click();
      await sleep(400);
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
    // Script-writing aid: lists the visible controls and saves a screenshot under video/out/dump/.
    async dump(label) {
      mkdirSync('video/out/dump', { recursive: true });
      await page.screenshot({ path: `video/out/dump/${label}.png` });
      const lines = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, textarea, [data-action], [role="tab"], dialog[open]')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map(el => {
          const attrs = [...el.attributes].filter(a => /^(data-|name|type|class|id|value|aria-)/.test(a.name)).map(a => `${a.name}="${a.value.slice(0, 40)}"`).join(' ');
          return `<${el.tagName.toLowerCase()} ${attrs}> ${(el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 50)}`;
        }));
      writeFileSync(`video/out/dump/${label}.txt`, lines.join('\n'));
    },
    card: (title, subtitle) => demo('card', title, subtitle),
    hideCard: () => demo('hideCard'),
  };
}

export async function record({ layout, setup, cover, steps, framesDir, appUrl }) {
  const cfg = LAYOUTS[layout];
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const drive = createFakeDrive();
  const unhandled = [];
  // The screencast ignores emulated deviceScaleFactor; forcing it at launch gives full-size phone frames.
  const browser = await chromium.launch({ channel: 'chromium', args: [`--force-device-scale-factor=${cfg.deviceScaleFactor}`] });
  const { out, ...contextOptions } = cfg;
  const context = await browser.newContext({
    ...contextOptions, bypassCSP: true, serviceWorkers: 'block', locale: 'zh-TW', timezoneId: 'Asia/Taipei', acceptDownloads: true,
  });
  await context.clock.install({ time: new Date(RECORDING_TIME) });
  await routeEverything(context, new URL(appUrl).origin, drive, unhandled);
  await context.addInitScript({ path: 'video/lib/overlay.js' });
  const page = await context.newPage();
  page.on('pageerror', err => console.error('page error:', err.message));

  // Off camera: seed through the app's own storage, mark one-time notices seen, build fixtures.
  await page.goto(appUrl);
  await page.waitForSelector('[data-action="sign-in-google"]');
  await page.addScriptTag({ content: await seedBundle() });
  await page.evaluate(() => window.__seed.seed());
  await page.evaluate(keys => keys.forEach(k => localStorage.setItem(k, '1')), NOTICE_KEYS);
  mkdirSync('video/out/fixtures', { recursive: true });
  writeFileSync(IMPORT_DOCX, Buffer.from(await page.evaluate(() => window.__seed.importDocxBase64()), 'base64'));
  await drawPhotos(context);
  await page.reload();
  await page.waitForSelector('[data-action="sign-in-google"]');
  const d = helpers(page);
  if (setup) await setup(d);
  // The opening title card is up before the first frame, so the video never opens on the app.
  if (cover) {
    await d.card(...cover);
    await sleep(800);
  }

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
  try {
    for (const [index, step] of steps.entries()) {
      const start = now();
      if (step.chapter) {
        chapters.push({ title: step.chapter, start });
        await page.evaluate(text => window.__demo.chapter(text), step.chapter);
      }
      const waits = [step.do ? step.do(d).catch(err => { throw new Error(`step ${index} (${step.say || step.chapter || ''}): ${err.message}`); }) : Promise.resolve()];
      if (step.audio) {
        clips.push({ file: step.audio.file, start });
        for (const cue of splitCaption(step.say, start, step.audio.duration, layout === 'phone' ? 15 : 28)) {
          cues.push(cue);
          waits.push(sleep((cue.start - start) * 1000).then(() => page.evaluate(text => window.__demo.caption(text), cue.text)));
        }
        waits.push(sleep(step.audio.duration * 1000));
      }
      await Promise.all(waits);
      // Keep the caption up into the next spoken step (it is replaced there) so it doesn't blink.
      if (!steps[index + 1]?.audio) await page.evaluate(() => window.__demo.caption(''));
      await sleep(STEP_GAP_MS);
    }
  } catch (err) {
    await page.screenshot({ path: join(framesDir, '..', 'failed-step.png') }).catch(() => {});
    await browser.close();
    throw err;
  }

  await sleep(500);
  const end = now();
  await cdp.send('Page.stopScreencast');
  await browser.close();
  return { frames, end, clips, cues, chapters, size: out, unhandled: [...unhandled, ...drive.unhandled] };
}
