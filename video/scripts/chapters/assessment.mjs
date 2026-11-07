import { point, pick, HOME } from './common.mjs';

export const title = '適性總表';
const AGG = 'form[data-action="aggregate"]';

export function steps(layout) {
  return [
    {
      chapter: title,
      say: '適性總表可以自己填，也可以直接從適性紀錄彙整，不用再抄一次。在首頁按「適性總表」，選幼兒。',
      do: async d => {
        await d.click('[data-type="assessment"]');
        await d.click('[data-child-id="1"]');
      },
    },
    {
      say: pick(layout, '按「從適性紀錄彙整」，勾選要彙整的月份，好幾個月可以一次彙整。', '按「彙整」，勾選要彙整的月份，好幾個月可以一次彙整。'),
      do: async d => {
        await d.click('[data-action="aggregate"]');
        const boxes = d.page.locator(`${AGG} [data-report-checkbox]`);
        for (let i = 0; i < await boxes.count(); i += 1) {
          await d.click(`${AGG} [data-report-checkbox] >> nth=${i}`);
        }
      },
    },
    {
      say: '選「建立新總表」，按「建立總表」。課程計畫表裡的每一次紀錄，都會自動填進總表。',
      do: async d => {
        await d.click(`${AGG} [data-field="target-mode"][value="new"]`);
        await d.click(`${AGG} button[type="submit"]`);
        await d.wait(800);
      },
    },
    {
      say: '剛才那筆前一個年齡層的指標，系統會先提醒：它會放進總表的「備註」。確認沒問題，按「確認彙整」。',
      do: async d => {
        await point(d, 'text=不屬於此階段的指標', '放進備註', 2600);
        await d.click('button:has-text("確認彙整")');
        await d.wait(800);
      },
    },
    {
      say: '總表依領域分頁，每個指標下面列出每一次的日期和狀態。請假的那一次會用紅字標示。',
      do: d => point(d, '[data-domain-tab="1"]', '依領域分頁', 2800),
    },
    {
      say: '要補一筆紀錄，在指標下面按「新增觀察紀錄」。',
      do: async d => {
        await d.click('[data-add-entry-for="Ⅴ-1-2"]');
        await d.wait(1200);
        await d.page.keyboard.press('Escape');
      },
    },
    {
      say: pick(layout, '檢查好了，按右上角的「匯出 Word」，就是印出來的適性總表。', '檢查好了，按右上角的「匯出」，就是印出來的適性總表。'),
      do: async d => {
        await d.click('[data-action="export"]');
        await d.wait(1200);
        await d.click(HOME);
      },
    },
  ];
}
