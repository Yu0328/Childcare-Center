import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

// This builds the hosted (GitHub Pages) version — a small set of files instead of the desktop
// build's single self-contained TableC.html, because a Service Worker (needed for offline/PWA
// use, since mobile browsers won't open a local file directly) has to be its own fetchable file,
// not something inlined into the page.
mkdirSync('site/icons', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['src/webEntry.js'],
  bundle: true,
  format: 'iife',
  globalName: 'CFormApp',
  write: false,
  target: ['chrome100', 'safari15'],
});

const js = result.outputFiles[0].text;
const css = readFileSync('src/styles.css', 'utf-8');

// Every rebuild gets a fresh cache name derived from the bundle's own content, so a redeploy
// reliably invalidates old clients' cached copy instead of a cache-first Service Worker serving
// a stale version forever.
const buildHash = createHash('sha256').update(js).digest('hex').slice(0, 12);
const cacheName = `c-form-cache-${buildHash}`;

// Public by design — an OAuth Client ID is not a secret (the client secret is, and this app
// doesn't use one: GIS's token flow doesn't need it).
const GOOGLE_CLIENT_ID = '841383586205-ohr1uhsrii1tg3oevtcacimc4sviekcr.apps.googleusercontent.com';

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#2a78d6">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com; base-uri 'none'; form-action 'none';">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<title>屏東縣內埔鄉育英公托填表系統</title>
<style>
${css}
</style>
</head>
<body>
<header class="app-header">
  <button type="button" class="app-header__brand" id="home-button"><img src="icons/icon-192.png" alt="" class="app-header__brand-icon">屏東縣內埔鄉育英公托填表系統</button>
  <div class="app-header__actions">
    <div class="sync-header" id="sync-slot"></div>
  </div>
</header>
<main id="app"></main>
<script>
${js}
document.addEventListener('DOMContentLoaded', () => {
  const syncControls = CFormApp.wireSyncControls({
    clientId: '${GOOGLE_CLIENT_ID}',
    syncSlot: document.getElementById('sync-slot'),
    // Guest mode is the only mode with backup buttons (see renderSyncHeader) — they're created
    // fresh every time the header repaints as guest, so this has to (re-)wire them each time
    // rather than once at load like the offline build does.
    wireBackup: (exportButton, importInput) => CFormApp.wireBackupControls({ exportButton, importInput }),
  });
  CFormApp.mountApp(document.getElementById('app'), {
    gate: syncControls.gate,
  });
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => CFormApp.wireUpdatePrompt());
}
</script>
</body>
</html>
`;

const manifest = {
  name: '屏東縣內埔鄉育英公托填表系統',
  short_name: '育英公托填表',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  background_color: '#f4f4f1',
  theme_color: '#2a78d6',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};

const serviceWorker = `const CACHE_NAME = '${cacheName}';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// A new version waits for the page's 更新 button (src/pwa/updatePrompt.js) instead of taking
// over mid-edit on its own.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only same-origin GETs are cacheable. The old handler tried to cache.put() every request,
  // which throws on a POST and on an opaque cross-origin response — and on failure fell back to
  // caches.match(), resolving with undefined and breaking every Drive API call while offline.
  // Anything else goes straight to the network so the sync layer sees real errors.
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`;

writeFileSync('site/index.html', html);
writeFileSync('site/manifest.json', JSON.stringify(manifest, null, 2));
writeFileSync('site/sw.js', serviceWorker);
copyFileSync('assets/icons/icon-192.png', 'site/icons/icon-192.png');
copyFileSync('assets/icons/icon-512.png', 'site/icons/icon-512.png');

console.log('Built site/ (cache %s)', cacheName);
