import { point } from './common.mjs';
import { IMPORT_DOCX } from '../../lib/recorder.mjs';

export const title = '匯入舊的 Word 檔';
const FORM = 'form[data-action="confirm-import"]';

export function steps(layout) {
  return [
    {
      chapter: title,
      say: '以前用 Word 做好的表單，可以直接匯進來。在首頁按「匯入檔案」，選要匯入的 Word 檔。',
      do: async d => {
        await d.setFiles('[data-action="import-any-docx"]', '[data-field="import-any-file"]', [IMPORT_DOCX]);
        await d.wait(800);
      },
    },
    {
      say: '系統會自己認出這是適性總表，列出檔案裡的姓名、月齡階段、紀錄年月，還有每一筆觀察紀錄。',
      do: async d => {
        if (layout === 'desktop') {
          await d.zoom(`${FORM}`, 1.35);
          await d.wait(2600);
          await d.unzoom();
        } else {
          await point(d, '[data-entry-include="0"]', '每一筆觀察紀錄', 2400);
        }
      },
    },
    {
      say: '不要的紀錄可以取消勾選。確認沒問題，按「確認匯入」。',
      do: d => d.click(`${FORM} button[type="submit"]`),
    },
    {
      say: '適性總表、適性紀錄和課程月計畫的 Word 檔都能匯入。姓名和生日都一樣的幼兒，資料會接在同一位幼兒底下，不會重複新增。',
      do: d => d.wait(1500),
    },
  ];
}
