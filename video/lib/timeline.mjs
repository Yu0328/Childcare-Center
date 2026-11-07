// video/lib/timeline.mjs
import { createHash } from 'node:crypto';

export function ttsKey(voice, rate, text) {
  return createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 16);
}

const MAX_CAPTION_CHARS = 28;

// One cue per sentence; a sentence too long for one caption line is packed at its commas.
// Time is shared by character count, since narration speed is roughly constant per character.
export function splitCaption(text, start, duration, maxChars = MAX_CAPTION_CHARS) {
  const pieces = [];
  for (const sentence of text.split(/(?<=[。！？；])/).filter(Boolean)) {
    if (sentence.length <= maxChars) { pieces.push(sentence); continue; }
    let current = '';
    for (const part of sentence.split(/(?<=[，、])/)) {
      if (current && current.length + part.length > maxChars) { pieces.push(current); current = ''; }
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
