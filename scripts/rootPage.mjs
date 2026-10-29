// The old URL (/Childcare-Center/) after 育英 moved to yuying/ — see
// docs/superpowers/specs/2026-10-29-multi-center-design.md §4. Teachers keep their old home-screen
// icon (an iPhone re-install would start an empty app), so this page stays for good: first visit
// shows the notice, later ones go straight on. "移除通知" later = drop the notice, keep the redirect.

export function rootIndexHtml(targetId) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#2a78d6">
<title>填表系統搬到新網址了</title>
<script>
if (localStorage.getItem('c-form-moved-seen')) location.replace('${targetId}/');
</script>
<style>
body { margin: 0; font-family: system-ui, sans-serif; background: #f4f4f1; color: #222; line-height: 1.7; }
main { max-width: 32rem; margin: 0 auto; padding: 2.5rem 1.25rem; }
h1 { font-size: 1.4rem; margin: 0 0 .75rem; }
.go { display: block; width: 100%; padding: .9rem; font-size: 1.15rem; border: 0; border-radius: .6rem; background: #2a78d6; color: #fff; cursor: pointer; }
.url { word-break: break-all; background: #fff; padding: .5rem .75rem; border-radius: .4rem; border: 1px solid #ddd; }
.copy { padding: .4rem .9rem; border: 1px solid #2a78d6; border-radius: .4rem; background: #fff; color: #2a78d6; cursor: pointer; }
.small { font-size: .9rem; color: #555; }
</style>
</head>
<body>
<main>
  <h1>填表系統搬到新網址了</h1>
  <p>資料都還在，不用重新登入。按下面的按鈕就能繼續使用。</p>
  <button type="button" class="go" id="go">繼續使用</button>
  <section id="browser-only" hidden>
    <p>新網址：</p>
    <p class="url" id="new-url"></p>
    <p><button type="button" class="copy" id="copy">複製新網址</button> <span id="copied" hidden>已複製</span></p>
    <p>如果有把舊網址加入書籤，請改成新網址。</p>
  </section>
  <p class="small">想把手機主畫面的圖示換成新的，可以在新網址按「安裝」。沒有用 Google 登入的話，請先按「備份 → 匯出備份」，裝好後在新的 App 裡「匯入備份」。</p>
</main>
<script>
const target = '${targetId}/';
document.getElementById('go').addEventListener('click', () => {
  localStorage.setItem('c-form-moved-seen', '1');
  location.replace(target);
});
// Opened from the old home-screen icon there's no bookmark or address bar to update.
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (!standalone) {
  const url = new URL(target, location.href).href;
  document.getElementById('new-url').textContent = url;
  document.getElementById('browser-only').hidden = false;
  document.getElementById('copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(url).then(() => { document.getElementById('copied').hidden = false; }, () => {});
  });
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
</script>
</body>
</html>
`;
}

// Replaces the pre-move service worker at the old URL. It waits for SKIP_WAITING like every
// centre's does, so a teacher's open old copy only switches over at a safe moment
// (src/pwa/updatePrompt.js) — then reloads into the notice above. It answers only for this page:
// requests under a centre's folder belong to that folder's own service worker.
export function rootServiceWorker(cacheName) {
  return `const CACHE_NAME = '${cacheName}';
const ASSETS = ['./', './index.html'];
const PAGES = ASSETS.map(path => new URL(path, self.location).pathname);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Pre-move caches were all named c-form-cache-*; centres' caches (c-form-site-*) are not ours.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('c-form-cache-') || (key.startsWith('c-form-root-') && key !== CACHE_NAME))
      .map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !PAGES.includes(url.pathname)) return;
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
}
