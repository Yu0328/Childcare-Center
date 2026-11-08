// video/lib/timeline.mjs
import { createHash } from 'node:crypto';

export function ttsKey(voice, rate, text) {
  return createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 16);
}

const MAX_CAPTION_CHARS = 28;

// Burned-in captions are one line each, without punctuation: each sentence becomes one or more
// lines, its comma parts packed (joined by a space) up to maxChars; a run with no comma that is
// still too long is cut into even pieces. Time is shared by character count, since narration speed
// is roughly constant per character.
const clean = part => part.replace(/[「」『』（）()]/g, '').replace(/[／/]/g, ' ').replace(/[，。！？；：、]/g, '').trim();

function evenPieces(part, maxChars) {
  const n = Math.ceil(part.length / maxChars);
  const size = Math.ceil(part.length / n);
  return Array.from({ length: n }, (_, i) => part.slice(i * size, (i + 1) * size));
}

export function splitCaption(text, start, duration, maxChars = MAX_CAPTION_CHARS) {
  const lines = [];
  for (const sentence of text.split(/(?<=[。！？；])/)) {
    let current = '';
    for (const part of sentence.split(/(?<=[，、：])/).map(clean).filter(Boolean)) {
      for (const piece of part.length > maxChars ? evenPieces(part, maxChars) : [part]) {
        if (current && current.length + 1 + piece.length > maxChars) { lines.push(current); current = ''; }
        current = current ? `${current} ${piece}` : piece;
      }
    }
    if (current) lines.push(current);
  }
  const weight = line => line.replace(/ /g, '').length;
  const total = lines.reduce((sum, line) => sum + weight(line), 0);
  let t = start;
  return lines.map((line, i) => {
    const end = i === lines.length - 1 ? start + duration : t + (duration * weight(line)) / total;
    const cue = { text: line, start: t, end };
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
