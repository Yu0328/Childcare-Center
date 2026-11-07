import { offerInstall, point, pick, HOME } from './common.mjs';

export const title = '開始使用';

export function steps(layout) {
  const device = pick(layout, '電腦', '手機');
  return [
    {
      chapter: title,
      say: `這支影片會一步一步示範育英公托填表系統在${device}上的操作。第一次打開網站時，會先問要不要讓資料在裝置之間自動同步。`,
      do: d => point(d, '[data-action="sign-in-google"]', '建議用 Google 登入', 2400),
    },
    {
      say: '點「使用 Google 登入」，選自己的 Google 帳號，就登入好了。',
      do: async d => {
        await d.click('[data-action="sign-in-google"]');
        await d.wait(700);
        await d.click('[data-fake-account]');
      },
    },
    {
      say: `上方會顯示上次同步的時間。之後在這台${device}新增或修改的資料，都會自動同步到你的 Google 帳號。`,
      do: d => point(d, '[data-sync-status]', '上次同步', 2600),
    },
    {
      say: '首頁有這幾個功能：管理幼兒、匯入檔案、適性總表、適性紀錄、課程月計畫，還有操作說明。',
      do: async d => {
        for (const sel of ['[data-action="manage-children"]', '[data-action="import-any-docx"]', '[data-type="assessment"]',
          '[data-type="parent-report"]', '[data-type="monthly-plan"]', '[data-action="show-help"]']) {
          await d.highlight(sel);
          await d.wait(850);
        }
        await d.clearHighlight();
      },
    },
    {
      say: '在任何畫面按最上方的系統名稱，就會回到首頁。',
      do: d => point(d, HOME, '回首頁', 2000),
    },
    {
      say: pick(layout,
        '用 Chrome 或 Edge 打開時，上方會有「加入主畫面」按鈕。按下去照著說明安裝，之後就能像一般程式一樣，從桌面打開。',
        '用手機打開時，上方會有「安裝」按鈕。按下去照著說明加到主畫面，之後就能像一般 App 一樣，從主畫面打開。'),
      do: async d => {
        await offerInstall(d);
        await d.wait(400);
        await d.click('[data-action="install"]');
        await d.wait(2600);
        await d.click('[data-install-action="close"]');
      },
    },
  ];
}
