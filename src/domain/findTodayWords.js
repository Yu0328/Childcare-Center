import { DOMAINS } from '../data/indicators.js';
import { toRocDate } from '../export/docxShared.js';

// Words a parent reading the exported file at month's end can't pin to a date — see
// docs/superpowers/specs/2026-10-04-today-word-check-design.md.
const TODAY_WORDS = ['今天', '今日'];
const hasTodayWord = text => typeof text === 'string' && TODAY_WORDS.some(word => text.includes(word));

export function findTodayWords({
  coursePlanEntries, courseOccurrencesByEntryId, developmentRecordEntries, behaviorObservations, highlightEntries,
}) {
  const hits = [];
  const add = (kind, id, label, text) => { if (hasTodayWord(text)) hits.push({ kind, id, label, text }); };
  for (const entry of coursePlanEntries) {
    for (const occurrence of courseOccurrencesByEntryId[entry.id] || []) {
      add('occurrence', occurrence.id, `課程計畫表｜${entry.activityName}｜${toRocDate(occurrence.date)} 說明`, occurrence.note);
    }
  }
  for (const record of developmentRecordEntries) {
    const domainName = DOMAINS.find(d => d.id === record.domain)?.name || '';
    add('developmentRecord', record.id, `適性發展紀錄表｜${domainName}`, record.narrative);
  }
  for (const observation of behaviorObservations) {
    add('observationTitle', observation.id, '行為觀察｜標題', observation.title);
    add('observationNarrative', observation.id, `行為觀察｜${observation.title}｜內容`, observation.narrative);
  }
  for (const highlight of highlightEntries) {
    add('highlight', highlight.id, '點滴分享｜照片說明', highlight.caption);
  }
  return hits;
}
