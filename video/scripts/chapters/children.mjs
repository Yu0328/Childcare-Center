import { openAddForm, point, pick, HOME } from './common.mjs';
import { NEW_CHILD } from '../../seed/data.mjs';

export const title = '管理幼兒';
const FORM = 'form[data-action="add-child"]';
const [year, month, day] = NEW_CHILD.birthDate.split('-').map(Number);

export function steps(layout) {
  return [
    {
      chapter: title,
      say: '開始填表前，先把班上的幼兒建好。在首頁按「管理幼兒」。',
      do: d => d.click('[data-action="manage-children"]'),
    },
    {
      say: pick(layout, '在右邊填姓名、選出生日期，按「新增」。', '按右下角的加號，填姓名、選出生日期，按「新增」。'),
      do: async d => {
        await openAddForm(d, layout);
        if (layout === 'desktop') await d.zoom(FORM, 1.6);
        await d.type(`${FORM} [data-field="name"]`, NEW_CHILD.name);
        await d.select(`${FORM} [data-field="birthDate-year"]`, String(year));
        await d.select(`${FORM} [data-field="birthDate-month"]`, String(month));
        await d.select(`${FORM} [data-field="birthDate-day"]`, String(day));
        await d.click(`${FORM} button[type="submit"]`);
        if (layout === 'desktop') await d.unzoom();
      },
    },
    {
      say: '新增好的幼兒會出現在列表裡，旁邊會算好幾個月大。之後建立表單時，系統會依月齡自動帶出適用的年齡層。',
      do: d => point(d, `[data-child-id]:has-text("${NEW_CHILD.name}")`, `${NEW_CHILD.name}已加入`, 3000),
    },
    {
      say: '要刪除幼兒，按名字右邊的「叉叉」，確認後按「確定」。這位幼兒所有的表單也會一起刪除。',
      do: d => d.clickConfirm('[aria-label="刪除黃小寶"]'),
    },
    {
      say: '姓名和生日之後不能修改，打錯了請刪除再重新新增。',
      do: async d => {
        await d.wait(1800);
        await d.click(HOME);
      },
    },
  ];
}
