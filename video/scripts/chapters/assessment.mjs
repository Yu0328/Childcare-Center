import { openAddForm, point, pick, HOME } from './common.mjs';

export const title = '適性總表';
const AGG = 'form[data-action="aggregate"]';
const CODE = 'Ⅴ-1-3';
const field = name => `[data-entry-field="${name}"][data-indicator-code="${CODE}"]:visible`;

export function steps(layout) {
  return [
    {
      chapter: title,
      say: '適性總表是依年齡層整理的發展觀察紀錄。在首頁按「適性總表」，選幼兒。',
      do: async d => {
        await d.click('[data-type="assessment"]');
        await d.click('[data-child-id="1"]');
      },
    },
    {
      say: pick(layout,
        '先看自己填的方式。在右邊確認月齡階段和紀錄年月，按「新增」，再打開這份總表。',
        '先看自己填的方式。按加號，確認月齡階段和紀錄年月，按「新增」，再打開這份總表。'),
      do: async d => {
        await openAddForm(d, layout);
        await d.click('form[data-action="add-form"] button[type="submit"]');
        await d.click('[data-form-id]');
      },
    },
    {
      say: '總表會依領域列出這個年齡層的每一個指標。要記錄一次觀察，在指標下面按「新增觀察紀錄」。',
      do: d => d.click(`[data-add-entry-for="${CODE}"]`),
    },
    {
      say: '選日期和狀態，寫下觀察敘述，按「儲存」。',
      do: async d => {
        await d.fill(field('date'), '2026-11-12');
        await d.click(`${field('status')}[value="developing"]`);
        await d.type(field('note'), '能在原地雙腳跳起，落地時還需要扶一下。');
        await d.click(`[data-entry-save-for="${CODE}"]:visible`);
      },
    },
    {
      say: '紀錄會排在指標下面，圓圈是已發展，三角形是發展中。之後想改，點那一筆就能編輯。',
      do: d => point(d, 'text=能在原地雙腳跳起', '已記錄', 2800),
    },
    {
      say: '如果已經寫好適性紀錄，就不用再抄一次，可以直接彙整。先回到總表列表。',
      do: d => d.click('[data-action="back"]'),
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
      say: pick(layout,
        '總表依領域分頁，每個指標下面列出每一次的日期和狀態。請假的那一次會用紅字標示。',
        '總表依領域分成好幾段，每個指標下面列出每一次的日期和狀態。請假的那一次會用紅字標示。'),
      do: d => pick(layout,
        () => point(d, '[data-domain-tab="1"]', '依領域分頁', 2800),
        () => point(d, 'summary:has-text("身體動作")', '依領域分段', 2800))(),
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
