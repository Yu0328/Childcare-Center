// 點滴分享 分開描述 — see docs/superpowers/specs/2026-10-31-highlight-split-captions-design.md.
// An entry's captionGroups ([{ size, text }], sizes = photo counts left to right) is the source of
// truth when present. caption always holds the parts joined by line breaks, so every reader that
// predates this (sync's natural key, the conflict screen, a copy of the app not yet reloaded)
// still sees all of the text.

// The ways the photos of an entry can be split, by photo count. Groups are always adjacent photos:
// a description can only sit centered under photos that sit next to each other.
export const ARRANGEMENTS = { 2: [[1, 1]], 3: [[2, 1], [1, 2], [1, 1, 1]] };

// The groups if they fit the entry's photos, else null — read as one caption. They stop fitting
// when a photo can't be read (it's dropped from the list) or two devices' edits merged oddly.
export function validCaptionGroups(entry) {
  const groups = entry.captionGroups;
  if (!Array.isArray(groups) || groups.length < 2) return null;
  const wellFormed = groups.every(g => g && Number.isInteger(g.size) && g.size >= 1 && typeof g.text === 'string');
  return wellFormed && groups.reduce((sum, g) => sum + g.size, 0) === (entry.photos || []).length ? groups : null;
}

const joinTexts = texts => texts.filter(text => text.trim()).join('\n');
export const joinCaption = groups => joinTexts(groups.map(g => g.text));

// The one way to write an entry's descriptions. A single group is a plain caption: no
// captionGroups key at all (storage deletes the old one rather than storing an empty value).
export function captionFields(groups) {
  if (groups.length < 2) return { caption: groups[0] ? groups[0].text : '' };
  return { caption: joinCaption(groups), captionGroups: groups.map(({ size, text }) => ({ size, text })) };
}

// Texts stay with the box at the same position; any left without a box join the last one.
export function arrangeCaption(texts, sizes) {
  const groups = sizes.map((size, i) => ({ size, text: texts[i] ?? '' }));
  const last = groups[groups.length - 1];
  last.text = joinTexts([last.text, ...texts.slice(sizes.length)]);
  return groups;
}

// A removed photo shrinks its group; a group left with no photo hands its text to the previous
// group (or, if it was first, to the next one, ahead of that one's text). No text is dropped.
export function captionGroupsAfterRemovingPhoto(groups, photoIndex) {
  const next = groups.map(g => ({ ...g }));
  let end = 0;
  const at = next.findIndex(g => photoIndex < (end += g.size));
  next[at].size -= 1;
  if (next[at].size > 0) return next;
  const [emptied] = next.splice(at, 1);
  if (at > 0) next[at - 1].text = joinTexts([next[at - 1].text, emptied.text]);
  else next[0].text = joinTexts([emptied.text, next[0].text]);
  return next;
}

export function groupPhotoLabels(sizes) {
  let n = 0;
  return sizes.map(size => `第 ${Array.from({ length: size }, () => ++n).join('、')} 張`);
}
