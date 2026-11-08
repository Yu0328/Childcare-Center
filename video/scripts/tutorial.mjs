// Builds a 完整操作教學 video for one layout from the chapter modules (order = help chapters).
import * as start from './chapters/start.mjs';
import * as children from './chapters/children.mjs';
import * as importDocx from './chapters/import.mjs';
import * as monthlyPlan from './chapters/monthly-plan.mjs';
import * as parentReport from './chapters/parent-report.mjs';
import * as assessment from './chapters/assessment.mjs';
import * as backup from './chapters/backup.mjs';
import { signIn } from './chapters/common.mjs';

export const CHAPTERS = [start, children, importDocx, monthlyPlan, parentReport, assessment, backup];

// ONLY=<chapter title,…> records just those chapters (signed in off camera) — for fixing one part.
export function tutorial(layout) {
  const label = layout === 'phone' ? '手機版' : '電腦版';
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const chapters = only ? CHAPTERS.filter(c => only.includes(c.title)) : CHAPTERS;
  return {
    layout,
    setup: only && !only.includes(start.title) ? signIn : undefined,
    cover: ['育英公托填表系統', `完整操作教學（${label}）`],
    steps: [
      { say: '歡迎使用育英公托填表系統。' },
      { do: d => d.hideCard() },
      ...chapters.flatMap(c => c.steps(layout)),
      { say: '以上就是育英公托填表系統的操作方式，感謝收看。', do: d => d.card('感謝收看', '育英公托填表系統') },
    ],
  };
}
