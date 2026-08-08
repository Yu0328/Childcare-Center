const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Stored data (child names, notes, imported backup JSON) is interpolated into innerHTML templates,
// so every interpolated value must be escaped before it reaches the DOM.
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}
