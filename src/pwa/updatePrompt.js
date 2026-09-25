// A redeploy used to take over and reload the page on its own, throwing away whatever a teacher
// had typed but not saved. Now the new version waits until they press 更新 on a small banner —
// see docs/superpowers/specs/2026-09-25-update-prompt-design.md.
export async function wireUpdatePrompt({
  serviceWorker = navigator.serviceWorker,
  host = document.body,
  reload = () => location.reload(),
} = {}) {
  let updateRequested = false;
  // Only a takeover the teacher asked for reloads — not the first install's clients.claim(), and
  // not another tab pressing 更新 (this tab keeps its banner and can reload when it's ready).
  serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) reload();
  });

  const registration = await serviceWorker.register('sw.js');

  function offer() {
    // No controller means this is the very first install, not an update.
    if (!serviceWorker.controller || host.querySelector('.update-banner')) return;
    host.insertAdjacentHTML(
      'beforeend',
      '<div class="update-banner" role="status">有新版本<button type="button" class="btn btn--primary btn--small">更新</button></div>'
    );
    host.querySelector('.update-banner button').addEventListener('click', () => {
      const waiting = registration.waiting;
      if (!waiting) return reload();
      updateRequested = true;
      waiting.postMessage('SKIP_WAITING');
    });
  }

  if (registration.waiting) offer();
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer();
    });
  });
  return registration;
}
