import { openAddForm, point, pick, HOME } from './common.mjs';
import { PHOTOS } from '../../lib/recorder.mjs';

export const title = '適性紀錄（家長版）';
const ENTRY = 'form[data-action="add-entry"]';
const RECORD = 'form[data-action="add-record"]';
const OBS = 'form[data-action="add-observation"]';
const HL = 'form[data-action="add-highlight"]';
// Typed with 今天 on purpose: the export check below finds it.
export const NARRATIVE_WITH_TODAY = '小明今天自己走上樓梯，很有成就感；拿蠟筆畫畫也越來越穩了。';
const NARRATIVE_FIXED = '小明 11 月 16 日自己走上樓梯，很有成就感；拿蠟筆畫畫也越來越穩了。';

export function steps(layout) {
  return [
    {
      chapter: title,
      say: '適性紀錄是每個月給家長的報告。在首頁按「適性紀錄(家長版)」，再選幼兒。',
      do: async d => {
        await d.click('[data-type="parent-report"]');
        await d.click('[data-child-id="1"]');
      },
    },
    {
      say: pick(layout,
        '右邊會依月齡帶出年齡階段，年月預設是這個月，按「新增」，再打開這份紀錄。',
        '按加號，系統會依月齡帶出年齡階段，年月預設是這個月，按「新增」，再打開這份紀錄。'),
      do: async d => {
        await openAddForm(d, layout);
        await d.click('form[data-action="add-report"] button[type="submit"]');
        await d.click('[data-report-id]:has-text("115年11月")');
      },
    },
    {
      say: '一份紀錄分成四個部分：課程計畫表、適性發展紀錄表、行為觀察和點滴分享。',
      do: async d => {
        for (const tab of ['coursePlan', 'developmentRecord', 'behaviorObservation', 'highlights']) {
          await d.highlight(`[data-tab="${tab}"]`);
          await d.wait(800);
        }
        await d.clearHighlight();
      },
    },
    {
      say: pick(layout,
        '同年齡層的幼兒，上的課通常一樣。按「套用其他幼兒課程計畫」，選林小美，就能把她這個月的課程計畫整份帶過來。',
        '同年齡層的幼兒，上的課通常一樣。按「套用」，選林小美，就能把她這個月的課程計畫整份帶過來。'),
      do: async d => {
        await d.click('[data-action="copy-course-plan"]');
        await d.click('dialog[open] [name="copy-plan-source"][value="2"]');
        await d.clickConfirm('dialog[open] button[type="submit"]');
      },
    },
    {
      say: '日期和說明會一起複製，狀態會重設成「已發展」，再依王小明的情況調整就好。',
      do: async d => {
        await d.click('summary:has-text("身體動作")');
        await point(d, 'text=115/11/03', '已複製', 2400);
      },
    },
    {
      say: '例如王小明 11 月 17 日請假：點那一筆，勾「請假／未執行」，按「儲存」。',
      do: async d => {
        await d.click('text=115/11/17');
        await d.click('[data-occurrence-edit-field="absent"]:visible');
        await d.click('[data-occurrence-edit-save-for]:visible');
      },
    },
    {
      say: pick(layout,
        '新增課程項目時，可以在「指標所屬年齡層」切換到前一個年齡層，繼續追蹤還沒完成的指標。',
        '按加號新增課程項目。在「指標所屬年齡層」可以切換到前一個年齡層，繼續追蹤還沒完成的指標。'),
      do: async d => {
        await openAddForm(d, layout);
        await d.click(`${ENTRY} [data-indicator-tier="Ⅳ"]`);
        await d.select(`${ENTRY} [data-field="indicatorCode"]`, 'Ⅳ-1-3');
      },
    },
    {
      say: '活動名稱和指標內容會自動帶入。填日期、選狀態、寫說明，按「新增」。',
      do: async d => {
        await d.fill(`${ENTRY} [data-field="occurrenceDate"]`, '2026-11-24');
        await d.click(`${ENTRY} [data-field="occurrenceStatus"][value="developed"]`);
        await d.type(`${ENTRY} [data-field="occurrenceNote"]`, '能拉著小車在教室裡走一圈。');
        await d.click(`${ENTRY} button[type="submit"]`);
      },
    },
    {
      say: '前一個年齡層的指標，會排在這個年齡層的指標後面，匯出的 Word 也一樣。',
      do: d => point(d, 'text=拉著玩具走', '前一個年齡層', 2400),
    },
    {
      say: pick(layout,
        '在「適性發展紀錄表」選領域、勾選要引用的課程項目，寫下這個月的發展情形，按「新增」。',
        '在「適性發展紀錄表」按加號，選領域、勾選要引用的課程項目，寫下這個月的發展情形，按「新增」。'),
      do: async d => {
        await d.click('[data-tab="developmentRecord"]');
        await openAddForm(d, layout);
        await d.click(`${RECORD} [data-course-entry-checkbox]`);
        await d.type(`${RECORD} [data-field="narrative"]`, NARRATIVE_WITH_TODAY);
        await d.click(`${RECORD} button[type="submit"]`);
      },
    },
    {
      say: '「行為觀察」填標題和敘述，按「新增」。',
      do: async d => {
        await d.click('[data-tab="behaviorObservation"]');
        await openAddForm(d, layout);
        await d.type(`${OBS} [data-field="title"]`, '主動收玩具');
        await d.type(`${OBS} [data-field="narrative"]`, '遊戲結束時，小明會把積木放回籃子裡。');
        await d.click(`${OBS} button[type="submit"]`);
      },
    },
    {
      say: '「點滴分享」可以一次選好幾張照片。',
      do: async d => {
        await d.click('[data-tab="highlights"]');
        await openAddForm(d, layout);
        await d.setFiles(`${HL} [data-drop-slot="0"]`, `${HL} [data-photo-slot="0"]`, PHOTOS);
        await d.wait(1200);
      },
    },
    {
      say: '想換照片的順序，按住照片拖到別的位置就可以。',
      do: d => d.drag(`${HL} [data-drop-slot="2"]`, `${HL} [data-drop-slot="0"]`),
    },
    {
      say: '按「分開描述」，選照片怎麼分組，每一組寫自己的描述。匯出時，描述會印在那幾張照片的正下方。',
      do: async d => {
        await d.click(`${HL} [data-caption-split]`);
        await d.click(`${HL} [data-caption-arrange="2,1"]`);
        await d.type(`${HL} [data-caption-part="0"]`, '到戶外散步，用蠟筆畫下看到的樹。');
        await d.type(`${HL} [data-caption-part="1"]`, '和同伴一起把積木疊高。');
        await d.click(`${HL} button[type="submit"]`);
      },
    },
    {
      say: pick(layout, '四個部分都填好了，按右上角的「匯出 Word」。', '四個部分都填好了，按右上角的「匯出」。'),
      do: d => d.click('[data-action="export"]'),
    },
    {
      say: '匯出前，系統會檢查有沒有寫到「今天」或「今日」。家長收到報告時已經不是那一天了，所以這些字會用紅底標出來。',
      do: d => point(d, 'dialog[open] [data-today-field="0"]', '紅底：今天', 3000),
    },
    {
      say: '直接在這裡改成日期，紅底就會消失。改好按「儲存並匯出」，Word 檔就會下載。',
      do: async d => {
        await d.fill('dialog[open] [data-today-field="0"]', NARRATIVE_FIXED);
        await d.wait(900);
        await d.click('dialog[open] [data-today-action="save-export"]');
        await d.wait(1200);
        await d.click(HOME);
      },
    },
  ];
}
