import { point, pick } from './common.mjs';

export const title = '資料保存';

export function steps(layout) {
  return [
    {
      chapter: title,
      say: '用 Google 登入後，資料會自動同步。上方會顯示上次同步的時間，按「立即同步」，可以馬上檢查另一台裝置有沒有新資料。',
      do: async d => {
        await point(d, '[data-sync-status]', '上次同步', 2200);
        await d.click('[data-action="sync-now"]');
      },
    },
    {
      say: pick(layout,
        '在手機或另一台電腦用同一個 Google 帳號登入，就會看到一樣的資料。',
        '在電腦或另一支手機用同一個 Google 帳號登入，就會看到一樣的資料。'),
      do: d => point(d, '[data-sync-greeting]', '同一個帳號', 2600),
    },
    {
      say: '不登入 Google 也可以用訪客身份使用，不過資料只會存在這台裝置上。',
      do: async d => {
        await d.wait(600);
        await d.click('[data-action="sync-sign-out"]');
      },
    },
    {
      say: '這時上方會多一個「備份」按鈕，裡面有「匯出備份」和「匯入備份」。換裝置時，先匯出備份檔，再到新的裝置匯入，就能把資料搬過去。',
      do: async d => {
        await d.click('.backup-menu summary');
        await point(d, '#export-backup', '匯出備份', 2000);
        await point(d, '.backup-menu label', '匯入備份', 2000);
        await d.click('.backup-menu summary');
      },
    },
  ];
}
