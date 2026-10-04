// Building blocks for the 操作說明 demos: tiny drawings of the app's screens, as HTML strings.
// Everything is sized in em (see .ms in styles.css), so a drawing scales with its device frame.
// `m` is the mode being drawn — 'phone' or 'desk'. A piece marked `hit` is what the demo's
// pointer moves to and presses.

export const pick = (m, desk, phone) => (m === 'phone' ? phone : desk);

const hitAttr = hit => (hit ? ' data-hit' : '');
const cls = (base, mod) => `${base}${mod ? ` ${base}--${mod}` : ''}`;

export const screen = (...parts) => `<div class="ms">${parts.join('')}</div>`;

// Page header: ← back (short on a phone — 「← 返回」 unless `back` is [desktop, phone]), title,
// right-hand buttons.
export const bar = (m, { back = '', title = '', actions = '' } = {}) => {
  const [desk, phone] = Array.isArray(back) ? back : [back, '← 返回'];
  return `<div class="ms-bar">${back ? `<span class="ms-back">${pick(m, desk, phone)}</span>` : ''}<b class="ms-title">${title}</b><span class="ms-actions">${actions}</span></div>`;
};

export const btn = (label, kind = '', hit = false) => `<span class="${cls('ms-btn', kind)}"${hitAttr(hit)}>${label}</span>`;
export const cb = (label, on = false, hit = false) => `<span class="ms-cb${on ? ' on' : ''}"${hitAttr(hit)}><i></i>${label}</span>`;
export const radio = (label, on = false, hit = false) => `<span class="ms-radio${on ? ' on' : ''}"${hitAttr(hit)}><i></i>${label}</span>`;
export const field = (label, value = '', hit = false) => `<span class="ms-field" data-v="${value}"${hitAttr(hit)}>${label}</span>`;
export const muted = text => `<span class="ms-muted">${text}</span>`;
export const warn = text => `<span class="ms-warn">${text}</span>`;
export const actions = (...items) => `<span class="ms-actions ms-actions--end">${items.join('')}</span>`;

export const tabs = (list, active, hit = false) =>
  `<div class="ms-tabs">${list.map(t => `<span${t === active ? ` class="on"${hitAttr(hit)}` : ''}>${t}</span>`).join('')}</div>`;

// A list row; `fill` slides it in (staggered by `i`) once the frame appears.
export const row = (content, { hit = false, fill = false, i = 0 } = {}) =>
  `<div class="ms-row${fill ? ' ms-fill' : ''}" style="--i:${i}"${hitAttr(hit)}>${content}</div>`;
export const date = d => `<span class="ms-date">${d}</span>`;
export const code = c => `<span class="ms-code">${c}</span>`;
export const glyph = s => `<span class="ms-glyph${s === '△' ? ' ms-glyph--dev' : ''}">${s}</span>`;
export const del = (hit = false) => `<span class="ms-del"${hitAttr(hit)}>×</span>`;
export const group = (text, { fill = false, i = 0 } = {}) => `<span class="ms-group${fill ? ' ms-fill' : ''}" style="--i:${i}">${text}</span>`;

// Content area: a list, plus (on a computer) the always-open add form on the right.
export const main = (list, aside = '') => `<div class="ms-main"><div class="ms-list">${list}</div>${aside}</div>`;
export const aside = (title, ...items) => `<div class="ms-aside"><b>${title}</b>${items.join('')}</div>`;
export const fab = (hit = false) => `<span class="ms-fab"${hitAttr(hit)}>＋</span>`;

export const card = (title, { tone = '', icon = '', desc = '', hit = false } = {}) =>
  `<span class="${cls('ms-card', tone)}"${hitAttr(hit)}>${icon ? `<span class="ms-card__icon">${icon}</span>` : ''}<span>${title}${desc ? `<small>${desc}</small>` : ''}</span></span>`;

// Popup: a centred dialog on a computer, a sheet from the bottom on a phone.
export const modal = (title, body, buttons) =>
  `<div class="ms-modal"><div class="ms-dialog">${title ? `<b>${title}</b>` : ''}${body}${buttons ? actions(buttons) : ''}</div></div>`;
// The browser's own confirm box looks the same on both.
export const confirmBox = (text, hit = true) =>
  `<div class="ms-modal ms-modal--center"><div class="ms-dialog ms-dialog--confirm">${text}${actions(btn('取消'), btn('確定', 'primary', hit))}</div></div>`;
export const toast = text => `<div class="ms-toast">${text}</div>`;
export const file = name => `<span class="ms-file"><s>W</s>${name}</span>`;
export const download = name => `<div class="ms-download"><span class="ms-file ms-file--big"><s>${name.endsWith('.json') ? '{ }' : 'W'}</s>${name}</span><span class="ms-muted">已下載</span></div>`;

// A drop-down menu pinned to a corner (`at`: 'top' / 'bottom').
export const menu = (items, { at = 'top' } = {}) =>
  `<div class="ms-menu ms-menu--${at}">${items.map(([label, hit]) => `<span${hitAttr(hit)}>${label}</span>`).join('')}</div>`;

// A whole device — a phone, or a browser window — around one screen.
export const device = (m, inner = '') =>
  m === 'desk'
    ? `<div class="help-dev help-dev--desk" aria-hidden="true"><div class="help-dev__chrome"><i></i><i></i><i></i><span></span></div><div class="help-dev__screen">${inner}</div></div>`
    : `<div class="help-dev help-dev--phone" aria-hidden="true"><div class="help-dev__screen">${inner}</div></div>`;
