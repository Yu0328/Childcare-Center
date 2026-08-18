// Floating success notifications for events (like one file of a multi-file import queue
// finishing) that need to register with the user even though the screen changes again
// immediately after — appended to document.body, outside any view's own container, so the next
// view's container.innerHTML swap never wipes a toast out mid-display. Toasts stack (each is its
// own element, independently timed) rather than being merged into one message, so a multi-file
// batch naturally reads as one line per file instead of a single long comma-joined string.
let host = null;

function getHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  document.body.appendChild(host);
  return host;
}

export function showToast(message, { durationMs = 4000 } = {}) {
  const toast = document.createElement('p');
  toast.className = 'toast';
  toast.textContent = message;
  getHost().appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
  return toast;
}
