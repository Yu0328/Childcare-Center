// tests/videoTimeline.test.js
import { describe, it, expect } from 'vitest';
import { ttsKey, splitCaption, toSrt, toChapters, frameDurations } from '../video/lib/timeline.mjs';

describe('ttsKey', () => {
  it('is stable and changes with voice, rate or text', () => {
    const k = ttsKey('v', '+0%', '你好');
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(ttsKey('v', '+0%', '你好')).toBe(k);
    expect(ttsKey('w', '+0%', '你好')).not.toBe(k);
    expect(ttsKey('v', '+10%', '你好')).not.toBe(k);
    expect(ttsKey('v', '+0%', '你好。')).not.toBe(k);
  });
});

describe('splitCaption', () => {
  it('keeps a short line as one cue spanning the whole duration, without punctuation', () => {
    expect(splitCaption('點這裡新增幼兒。', 2, 3)).toEqual([{ text: '點這裡新增幼兒', start: 2, end: 5 }]);
  });

  it('breaks at sentence ends and shares time by length', () => {
    const cues = splitCaption('一二三。四五六七八九。', 0, 12);
    expect(cues.map(c => c.text)).toEqual(['一二三', '四五六七八九']);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBeCloseTo(4, 5); // 3 of 9 chars
    expect(cues[1].start).toBeCloseTo(4, 5);
    expect(cues[1].end).toBe(12);
  });

  it('packs comma parts of one sentence into one line, joined by a space', () => {
    expect(splitCaption('甲乙，丙丁。', 0, 1, 10).map(c => c.text)).toEqual(['甲乙 丙丁']);
  });

  it('breaks a sentence longer than the line at its commas', () => {
    const long = `${'甲'.repeat(20)}，${'乙'.repeat(20)}。`;
    expect(splitCaption(long, 0, 4, 28).map(c => c.text)).toEqual(['甲'.repeat(20), '乙'.repeat(20)]);
  });

  it('cuts a comma-free run longer than the line into even pieces', () => {
    expect(splitCaption(`${'甲'.repeat(30)}。`, 0, 1, 28).map(c => c.text)).toEqual(['甲'.repeat(15), '甲'.repeat(15)]);
  });

  it('drops quote marks and turns slashes into spaces', () => {
    expect(splitCaption('勾「請假／其他活動代替」。', 0, 1).map(c => c.text)).toEqual(['勾請假 其他活動代替']);
  });

  it('never makes a line longer than maxChars', () => {
    const text = '按右下角的加號，填姓名、選出生日期，按「新增」。這位幼兒所有的表單也會一起刪除。';
    for (const cue of splitCaption(text, 0, 5, 12)) expect(cue.text.length).toBeLessThanOrEqual(12);
  });
});

describe('toSrt', () => {
  it('numbers cues and formats hh:mm:ss,mmm', () => {
    expect(toSrt([
      { text: '甲', start: 0, end: 1.5 },
      { text: '乙', start: 61.25, end: 3725.004 },
    ])).toBe('1\n00:00:00,000 --> 00:00:01,500\n甲\n\n2\n00:01:01,250 --> 01:02:05,004\n乙\n');
  });
});

describe('toChapters', () => {
  it('prepends 0:00 片頭 when the first chapter starts later', () => {
    expect(toChapters([{ title: '管理幼兒', start: 12.7 }, { title: '月計畫', start: 75 }]))
      .toBe('0:00 片頭\n0:12 管理幼兒\n1:15 月計畫');
  });

  it('uses h:mm:ss past an hour and does not duplicate 0:00', () => {
    expect(toChapters([{ title: '開始使用', start: 0 }, { title: '尾', start: 3661 }]))
      .toBe('0:00 開始使用\n1:01:01 尾');
  });
});

describe('frameDurations', () => {
  it('gives each frame the gap to the next, and the last frame the gap to the end', () => {
    expect(frameDurations([0, 0.5, 2], 3)).toEqual([0.5, 1.5, 1]);
  });
});
