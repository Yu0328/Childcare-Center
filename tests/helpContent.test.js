import { describe, it, expect } from 'vitest';
import { HELP_CHAPTERS } from '../src/ui/helpContent.js';

describe('HELP_CHAPTERS', () => {
  it('has the 8 chapters in order, with unique ids', () => {
    expect(HELP_CHAPTERS.map(c => c.title)).toEqual([
      '開始使用', '管理幼兒', '匯入舊的 Word 檔', '課程月計畫', '適性紀錄（家長版）', '適性總表', '資料保存', '常見問題',
    ]);
    expect(new Set(HELP_CHAPTERS.map(c => c.id)).size).toBe(8);
  });

  it('every listed section has a matching heading in its chapter', () => {
    for (const chapter of HELP_CHAPTERS) {
      for (const section of chapter.sections || []) {
        expect(chapter.html).toContain(`id="help-section-${section.id}"`);
      }
    }
  });
});
