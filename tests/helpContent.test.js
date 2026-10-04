import { describe, it, expect } from 'vitest';
import { HELP_CHAPTERS } from '../src/ui/helpContent.js';

const demos = HELP_CHAPTERS.flatMap(chapter => chapter.demos || []);
const stepsFor = (demo, mode) => demo.steps.filter(step => !step.modes || step.modes.includes(mode));
const modesOf = demo => demo.modes || ['desk', 'phone'];

describe('HELP_CHAPTERS', () => {
  it('has the 9 chapters in order, with unique ids', () => {
    expect(HELP_CHAPTERS.map(c => c.title)).toEqual([
      '開始使用', '管理幼兒', '匯入舊的 Word 檔', '課程月計畫', '適性紀錄（家長版）', '適性總表', '實用技巧', '資料保存', '常見問題',
    ]);
    expect(new Set(HELP_CHAPTERS.map(c => c.id)).size).toBe(HELP_CHAPTERS.length);
    expect(new Set(demos.map(d => d.id)).size).toBe(demos.length);
  });

  it('every step of every demo draws a screen and has a caption, in each mode it is shown', () => {
    for (const demo of demos) {
      for (const mode of modesOf(demo)) {
        const steps = stepsFor(demo, mode);
        expect(steps.length, `${demo.id} ${mode}`).toBeGreaterThan(1);
        for (const step of steps) {
          const cap = typeof step.cap === 'string' ? step.cap : step.cap[mode];
          expect(cap, `${demo.id} ${mode}`).toBeTruthy();
          expect(step.draw(mode), `${demo.id} ${mode}`).toMatch(/class="ms"/);
        }
      }
    }
  });

  it('only the last frame of a demo may have nothing to press (it is the result)', () => {
    for (const demo of demos) {
      for (const mode of modesOf(demo)) {
        const steps = stepsFor(demo, mode);
        steps.slice(0, -1).forEach((step, i) => expect(step.draw(mode), `${demo.id} ${mode} step ${i + 1}`).toContain('data-hit'));
      }
    }
  });

  it('has the three 實用技巧 and the corrected 加到主畫面 steps', () => {
    const tips = HELP_CHAPTERS.find(c => c.id === 'tips').demos.map(d => d.title);
    expect(tips).toEqual(['套用其他幼兒的課程計畫', '把適性紀錄彙整成總表', '一次匯入多個 Word 檔']);
    const iphone = demos.find(d => d.id === 'install-iphone');
    expect(iphone.steps.map(s => s.cap).join()).toMatch(/⋯.*分享.*加入主畫面.*以網頁 App 打開/);
    const desk = demos.find(d => d.id === 'install-desk');
    expect(desk.steps.map(s => s.cap).join()).toMatch(/投放、儲存及分享.*將網頁安裝為應用程式/);
  });
});
