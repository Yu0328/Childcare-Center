import { openAddForm, point, pick, HOME } from './common.mjs';

export const title = '課程月計畫';
const FORM = 'form[data-action="add-plan"]';
const ADD = 'form[data-action="add-item"]';
// 王小明 1, 林小美 2, 陳小華 3 (seed order).
const day = (week, weekday, child = 1) =>
  `.monthly-calendar__day[data-child-id="${child}"][data-week-index="${week}"][data-weekday="${weekday}"]`;

// On the phone a day opens with a double tap and the child names fold behind one button.
async function openDay(d, layout, sel) {
  if (layout === 'phone') await d.doubleClick(sel);
  else await d.click(sel);
}
async function switchChild(d, layout, id) {
  if (layout === 'phone') await d.click('[data-child-switch-toggle]');
  await d.click(`[data-switch-child="${id}"]`);
}

export function steps(layout) {
  return [
    {
      chapter: title,
      say: '課程月計畫用月曆來排每位幼兒的活動。在首頁按「課程月計畫」。',
      do: d => d.click('[data-type="monthly-plan"]'),
    },
    {
      say: pick(layout, '在右邊選年月、勾選要排課的幼兒，按「新增」。', '按加號，選年月、勾選要排課的幼兒，按「新增」。'),
      do: async d => {
        await openAddForm(d, layout);
        await d.select(`${FORM} [data-field="period-month"]`, '12月');
        for (const id of [1, 2, 3]) await d.click(`${FORM} [data-child-checkbox="${id}"]`);
        await d.click(`${FORM} button[type="submit"]`);
      },
    },
    {
      say: '計畫建好就會直接打開。日期和星期都排好了，固定的大團體活動和節氣也已經先填上。',
      do: d => point(d, `${day(2, 1)}`, '預設活動', 2600),
    },
    {
      say: pick(layout,
        '上方可以切換幼兒。要調整幼兒的先後順序，按「管理幼兒」，再按「排順序」，依序點選幼兒。',
        '按名字可以切換幼兒。要調整幼兒的先後順序，按「管理」，再按「排順序」，依序點選幼兒。'),
      do: async d => {
        await d.click('[data-action="manage-children"]');
        await d.click('[data-action="sort-children"]');
        await d.click('[data-sort-child="2"]');
        await d.click('[data-sort-child="1"]');
      },
    },
    {
      say: '按「完成」再按「儲存」。上方的幼兒，還有匯出的 Word，都會照這個順序。',
      do: async d => {
        await d.click('[data-action="sort-done"]');
        await d.click('[data-action="save-children"]');
        await d.wait(600);
        await switchChild(d, layout, 1);
      },
    },
    {
      say: pick(layout, '現在是王小明的月曆。按一下要排課的日期。', '現在是王小明的月曆。在要排課的日期上連按兩下。'),
      do: d => openDay(d, layout, day(2, 3)),
    },
    {
      say: '選指標時，每個指標前面的圓點，代表王小明在這個指標的進度：綠色是已達成，橘色是未達成，灰色是還沒做過。',
      do: async d => {
        await d.click(`${ADD} [data-indicator-picker-toggle]`);
        await d.wait(600);
        await point(d, '[data-pick-indicator="Ⅴ-1-6"]', '未達成', 2600);
      },
    },
    {
      say: '選好之後，活動名稱和指標內容會自動帶入，下面也會列出同年齡層每位幼兒在這個指標的狀況。',
      do: async d => {
        await d.click('[data-pick-indicator="Ⅴ-1-6"]');
        await d.wait(500);
        await point(d, `${ADD} [data-field="new-item-activity-name"]`, '自動帶入', 2200);
      },
    },
    {
      say: '按「新增」，這個活動就排進王小明的這一天了。',
      do: async d => {
        await d.click(`${ADD} [data-add-submit]`);
        await d.wait(400);
        if (layout === 'phone') await d.page.keyboard.press('Escape');
        await point(d, day(2, 3), '已排入', 1600);
      },
    },
    {
      say: '如果王小明那天請假，打開那一天，在活動底下勾「請假／其他活動代替」，也可以寫上替代的活動。勾了就會自動存好。',
      do: async d => {
        await openDay(d, layout, day(1, 5));
        await d.click('[data-override-field="replaced"]:visible');
        await d.type('[data-override-field="replacementText"]:visible', '戶外教學');
        await d.wait(600);
        if (layout === 'phone') await d.page.keyboard.press('Escape');
      },
    },
    {
      say: pick(layout,
        '每位幼兒的月計畫是各自獨立的。要讓其他幼兒照著排，先切換到那位幼兒，再按「套用其他幼兒月計畫」。',
        '每位幼兒的月計畫是各自獨立的。要讓其他幼兒照著排，先切換到那位幼兒，再按「套用」。'),
      do: async d => {
        await switchChild(d, layout, 2);
        await d.click('[data-action="copy-monthly-plan"]');
      },
    },
    {
      say: '選要照著排的幼兒，按「套用」。系統會提醒原本的安排會被換掉，沒問題就按「確定」。',
      do: async d => {
        await d.click('dialog[open] [name="copy-plan-source"][value="1"]');
        await d.clickConfirm('dialog[open] button[type="submit"]');
      },
    },
    {
      say: '林小美的月曆就和王小明一樣了。請假和未達成的勾選不會跟著複製，再依每位幼兒的狀況勾選就好。',
      do: d => point(d, day(2, 3, 2), '照著排好了', 2400),
    },
    {
      say: pick(layout,
        '排好之後按右上角的「匯出 Word」，檔案會存到電腦的「下載」資料夾。',
        '排好之後按右上角的「匯出」，檔案會存到手機的「下載」資料夾。'),
      do: async d => {
        await d.click('[data-action="export-docx"]');
        await d.wait(1200);
        await d.click(HOME);
      },
    },
  ];
}
