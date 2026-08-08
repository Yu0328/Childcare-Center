import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

// This builds the hosted (GitHub Pages) version — a small set of files instead of the desktop
// build's single self-contained TableC.html, because a Service Worker (needed for offline/PWA
// use, since mobile browsers won't open a local file directly) has to be its own fetchable file,
// not something inlined into the page.
mkdirSync('site/icons', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['src/app.js'],
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

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#2a78d6">
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
  <span class="app-header__brand">屏東縣內埔鄉育英公托填表系統</span>
  <div class="app-header__actions">
    <button type="button" class="btn btn--header" id="export-backup">匯出備份</button>
    <label class="btn btn--header btn--header-file">匯入備份 <input type="file" id="import-backup" accept="application/json"></label>
  </div>
</header>
<main id="app"></main>
<script>
${js}
document.addEventListener('DOMContentLoaded', () => {
  CFormApp.wireBackupControls({
    exportButton: document.getElementById('export-backup'),
    importInput: document.getElementById('import-backup'),
  });
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
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
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
`;

writeFileSync('site/index.html', html);
writeFileSync('site/manifest.json', JSON.stringify(manifest, null, 2));
writeFileSync('site/sw.js', serviceWorker);
copyFileSync('assets/icons/icon-192.png', 'site/icons/icon-192.png');
copyFileSync('assets/icons/icon-512.png', 'site/icons/icon-512.png');

console.log('Built site/ (cache %s)', cacheName);
