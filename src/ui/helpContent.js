// The 操作說明 chapters (shown by src/ui/helpView.js). Each task is a demo — a few drawn screens
// played in a device frame — built from the pieces in helpMiniScreens.js. Every label drawn here
// must match what the app really shows (computer label in 'desk', the short phone label in
// 'phone'); when a button or a workflow changes, update its demo too. Example names only.

import {
  pick, screen, bar, btn, cb, radio, field, muted, warn, actions, tabs, row, date, code, glyph, del,
  group, main, aside, fab, card, modal, confirmBox, toast, file, download, menu,
} from './helpMiniScreens.js';
import { TYPE_SELECT_ICONS, UTIL_ICONS } from './reportTypeSelectView.js';

const svg = paths =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  start: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  tips: svg('<path d="M12 3l2.3 5.7L20 11l-5.7 2.3L12 19l-2.3-5.7L4 11l5.7-2.3z"/><path d="M19 3v3M17.5 4.5h3"/>'),
  backup: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><rect x="8" y="13" width="8" height="5" rx="1"/>'),
  faq: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.5"/><path d="M12 17.2v.1"/>'),
};

const tip = text => `<p class="help-tip">${text}</p>`;
const chip = (label, kind) => `<span class="help-chip${kind ? ` help-chip--${kind}` : ''}">${label}</span>`;

/* ---------- screens shared by several demos ---------- */

const APP_NAME = '屏東縣內埔鄉育英公托填表系統';
const appTop = ({ hitName = false, hitBackup = false, menuItems = null } = {}) =>
  `<div class="ms-apptop"><b${hitName ? ' data-hit' : ''}><span>${APP_NAME}</span></b>${btn('備份 ▾', 'header', hitBackup)}</div>${
    menuItems ? menu(menuItems) : ''
  }`;

const HOME_CARDS = [
  ['管理幼兒', 'rose', UTIL_ICONS['manage-children']],
  ['匯入檔案', 'rose', UTIL_ICONS['import-any-docx']],
  ['適性總表', 'brand', TYPE_SELECT_ICONS.assessment],
  ['適性紀錄(家長版)', 'purple', TYPE_SELECT_ICONS['parent-report']],
  ['課程月計畫', 'green', TYPE_SELECT_ICONS['monthly-plan']],
];
const homeScreen = (ring = '', { hitName = false, hitBackup = false, extra = '' } = {}) =>
  screen(
    appTop({ hitName, hitBackup }),
    `<div class="ms-home"><span class="ms-home__title">請選擇要填寫的表單</span><div class="ms-home__utils">${HOME_CARDS.slice(0, 2)
      .map(([title, tone, icon]) => card(title, { tone, icon, hit: ring === title }))
      .join('')}</div>${HOME_CARDS.slice(2)
      .map(([title, tone, icon]) => card(title, { tone, icon, hit: ring === title }))
      .join('')}</div>`,
    extra
  );

const childRow = (name, birth, months, { hit = false, hitDel = false, fill = false } = {}) =>
  row(`<b>${name}<small>${birth}　·　${months} 個月</small></b>${del(hitDel)}`, { hit, fill });
const CHILDREN = () => childRow('王小明', '114/03/05', 19) + childRow('林小美', '114/05/20', 17);

// A list screen with its add form: always open on the right on a computer; on a phone hidden
// behind the round ＋ (`fabHit` rings it) and opened as a popup (`popup: true`).
const listScreen = (m, { header, list, form, fabHit = false, popup = false, extra = '' }) =>
  screen(
    bar(m, header),
    main(list, m === 'desk' ? form : ''),
    m === 'phone' && !popup ? fab(fabHit) : '',
    m === 'phone' && popup ? `<div class="ms-modal"><div class="ms-dialog ms-dialog--form">${form}</div></div>` : '',
    extra
  );

// The steps for "fill in the add form and press 新增" — a phone first needs the ＋.
const addSteps = ({ draw, fabCap, formCap }) => [
  { modes: ['phone'], cap: fabCap || '按右下角藍色的「＋」', draw: m => draw(m, { fabHit: true }) },
  { cap: formCap, draw: m => draw(m, { popup: true, hitSubmit: true }) },
];

/* ---------- 1 開始使用 ---------- */

const safari = (content, { hitMore = false, sheet = '' } = {}) =>
  screen(content, `<div class="ms-browserbar ms-browserbar--bottom"><span>‹</span><span class="ms-url">yucare.github.io</span><span${hitMore ? ' data-hit' : ''}>⋯</span></div>`, sheet);
const chromePhone = (content, { hitMore = false, sheet = '' } = {}) =>
  screen(`<div class="ms-browserbar"><span class="ms-url">yucare.github.io</span><span${hitMore ? ' data-hit' : ''}>⋮</span></div>`, content, sheet);
const chromeDesk = (content, { hitMore = false, menus = '' } = {}) =>
  screen(`<div class="ms-browserbar"><span>←</span><span class="ms-url">yucare.github.io</span><span${hitMore ? ' data-hit' : ''}>⋮</span></div>`, content, menus);
const pageInside = () => `<div class="ms-page">${homeScreen()}</div>`;
const osHome = m =>
  screen(
    `<div class="ms-os${m === 'desk' ? ' ms-os--desk' : ''}">${'<span></span>'.repeat(m === 'desk' ? 3 : 7)}<span class="ms-os__app ms-fill"><i></i>育英公托填表</span></div>`
  );

const START = {
  id: 'start',
  title: '開始使用',
  desc: '首頁有什麼、加到主畫面',
  icon: ICONS.start,
  tone: 'warm',
  demos: [
    {
      id: 'home-tour',
      title: '首頁有什麼',
      steps: [
        { point: true, cap: '「管理幼兒」：新增、刪除幼兒', draw: () => homeScreen('管理幼兒') },
        { point: true, cap: '「匯入檔案」：把以前的 Word 檔匯進來', draw: () => homeScreen('匯入檔案') },
        { point: true, cap: '「適性總表」：依年齡層的發展觀察總表', draw: () => homeScreen('適性總表') },
        { point: true, cap: '「適性紀錄(家長版)」：每月給家長的報告', draw: () => homeScreen('適性紀錄(家長版)') },
        { point: true, cap: '「課程月計畫」：班級每月的活動安排', draw: () => homeScreen('課程月計畫') },
        { point: true, cap: '在任何畫面按最上方的系統名稱，就回到首頁', draw: () => homeScreen('', { hitName: true }) },
      ],
    },
    {
      id: 'install-iphone',
      title: '加到主畫面（iPhone）',
      modes: ['phone'],
      webOnly: true,
      steps: [
        { cap: '用 Safari 打開系統，按右下角的「⋯」', draw: () => safari(pageInside(), { hitMore: true }) },
        { cap: '按「分享」', draw: () => safari(pageInside(), { sheet: menu([['分享', true], ['加入書籤'], ['新增分頁']], { at: 'bottom' }) }) },
        {
          cap: '往下滑，按「加入主畫面」',
          draw: () => safari(pageInside(), { sheet: menu([['拷貝'], ['加入書籤'], ['加入主畫面', true], ['列印']], { at: 'bottom' }) }),
        },
        {
          cap: '確認「以網頁 App 打開」是開著的，按右上角「加入」',
          draw: () =>
            screen(
              `<div class="ms-bar"><span class="ms-back">取消</span><b class="ms-title">加入主畫面</b><span class="ms-actions">${btn('加入', 'link', true)}</span></div>`,
              `<div class="ms-form">${field('名稱', '育英公托填表')}<span class="ms-toggle on">以網頁 App 打開<i></i></span></div>`
            ),
        },
        { cap: '主畫面多了一個圖示，之後按它就能打開', draw: () => osHome('phone') },
      ],
    },
    {
      id: 'install-android',
      title: '加到主畫面（Android）',
      modes: ['phone'],
      webOnly: true,
      steps: [
        { cap: '用 Chrome 打開系統，按右上角的「⋮」', draw: () => chromePhone(pageInside(), { hitMore: true }) },
        { cap: '按「加到主畫面」', draw: () => chromePhone(pageInside(), { sheet: menu([['新增分頁'], ['書籤'], ['加到主畫面', true], ['設定']]) }) },
        { cap: '按「安裝」', draw: () => chromePhone(pageInside(), { sheet: modal('加到主畫面', muted('育英公托填表'), btn('安裝', 'primary', true)) }) },
        { cap: '主畫面多了一個圖示，之後按它就能打開', draw: () => osHome('phone') },
      ],
    },
    {
      id: 'install-desk',
      title: '安裝到電腦（Chrome）',
      modes: ['desk'],
      webOnly: true,
      note: 'Edge 的話：按右上角「…」→「應用程式」→「將此網站安裝為應用程式」。',
      steps: [
        { cap: '用 Chrome 打開系統，按右上角的「⋮」', draw: () => chromeDesk(pageInside(), { hitMore: true }) },
        { cap: '按「投放、儲存及分享」', draw: () => chromeDesk(pageInside(), { menus: menu([['新增分頁'], ['書籤和清單'], ['投放、儲存及分享', true], ['設定']]) }) },
        {
          cap: '按「將網頁安裝為應用程式…」',
          draw: () =>
            chromeDesk(pageInside(), {
              menus: menu([['新增分頁'], ['書籤和清單'], ['投放、儲存及分享'], ['設定']]) + menu([['投放…'], ['將網頁安裝為應用程式…', true], ['建立 QR 圖碼']], { at: 'sub' }),
            }),
        },
        { cap: '按「安裝」', draw: () => chromeDesk(pageInside(), { menus: modal('要安裝應用程式嗎？', muted('育英公托填表'), btn('取消') + btn('安裝', 'primary', true)) }) },
        { cap: '桌面和開始功能表多了一個圖示，之後按它就能打開', draw: () => osHome('desk') },
      ],
    },
  ],
  html: `
    <p class="help-offlineonly help-ch__intro">用的是單一檔案版本（檔名 TableC.html）的話，把檔案放在桌面，要用時按兩下打開就好。</p>
    ${tip(`打完字一定要按 ${chip('新增', 'primary')} 或 ${chip('儲存', 'primary')}，沒按就離開，內容不會留下。`)}`,
};

/* ---------- 2 管理幼兒 ---------- */

const childForm = (hitSubmit, filled = true) =>
  aside('新增幼兒', field('姓名', filled ? '王小明' : ''), field('出生日期', filled ? '114年　3月　5日' : ''), actions(btn('新增', 'primary', hitSubmit)));
const childListHeader = { back: '← 返回選擇表單', title: '幼兒列表' };
const childList = (m, { fabHit = false, popup = false, hitSubmit = false, list = childRow('林小美', '114/05/20', 17), extra = '' } = {}) =>
  listScreen(m, { header: childListHeader, list, form: childForm(hitSubmit, popup || m === 'desk'), fabHit, popup, extra });

const CHILDREN_CH = {
  id: 'children',
  title: '管理幼兒',
  desc: '新增、刪除幼兒',
  icon: UTIL_ICONS['manage-children'],
  tone: 'rose',
  demos: [
    {
      id: 'add-child',
      title: '新增幼兒',
      steps: [
        { cap: '在首頁按「管理幼兒」', draw: () => homeScreen('管理幼兒') },
        ...addSteps({
          draw: childList,
          formCap: { desk: '在右邊填姓名、選出生日期，按「新增」', phone: '填姓名、選出生日期，按「新增」' },
        }),
        { cap: '幼兒出現在列表中，旁邊會算好幾個月大', draw: m => childList(m, { list: childRow('林小美', '114/05/20', 17) + childRow('王小明', '114/03/05', 19, { fill: true }) }) },
      ],
    },
    {
      id: 'delete-child',
      title: '刪除幼兒',
      steps: [
        { cap: '按名字右邊的「×」', draw: m => childList(m, { list: childRow('王小明', '114/03/05', 19, { hitDel: true }) + childRow('林小美', '114/05/20', 17) }) },
        {
          cap: '確認後按「確定」',
          draw: m => childList(m, { list: CHILDREN(), extra: confirmBox('確定要刪除「王小明」的所有資料嗎？此操作無法復原。') }),
        },
        { cap: '這位幼兒和他所有的表單都刪除了', draw: m => childList(m) },
      ],
    },
  ],
  html: tip('姓名和生日不能修改。打錯了請刪除再重新新增，最好在開始填表前就檢查好。'),
};

/* ---------- 3 匯入舊的 Word 檔 ---------- */

const picker = files =>
  modal('選擇檔案', `${muted('可以一次選好幾個')}${files.map(([name, on, hit]) => `<span class="ms-pick${on ? ' on' : ''}"${hit ? ' data-hit' : ''}>${file(name)}</span>`).join('')}`, '');
// The 確認匯入內容 screen: a 總表 lists its 觀察紀錄; a 適性紀錄 its four parts, each tickable.
const IMPORT_PARTS = {
  適性總表: () =>
    `<span class="ms-group">觀察紀錄（共 2 筆，取消勾選可排除不匯入）</span>${row(`${cb('', true)}${date('115/10/07')}<b>音樂律動</b>${glyph('○')}`)}${row(
      `${cb('', true)}${date('115/10/14')}<b>積木疊高</b>${glyph('○')}`
    )}`,
  適性紀錄: () =>
    ['課程計畫表（共 5 項）', '適性發展紀錄表（共 2 段）', '行為觀察（共 1 筆）', '點滴分享（共 2 組）'].map(part => cb(part, true)).join(''),
};
const confirmImport = (m, kind, { name = '王小明', note = '', extra = '' } = {}) =>
  screen(
    bar(m, { back: ['← 取消匯入', '← 取消'], title: `確認匯入內容（${kind}）` }),
    `<div class="ms-form">${note ? `<span class="ms-note">${note}</span>` : ''}${field('姓名', name)}${field('月齡階段', 'Ⅴ（19-24個月）')}${IMPORT_PARTS[kind]()}${actions(
      btn('確認匯入', 'primary', true)
    )}</div>`,
    extra
  );

const IMPORT = {
  id: 'import',
  title: '匯入舊的 Word 檔',
  desc: '把以前用 Word 做的表單搬進來',
  icon: UTIL_ICONS['import-any-docx'],
  tone: 'rose',
  intro: '適性總表、適性紀錄、課程月計畫都能匯入，系統會自己認出是哪一種。',
  demos: [
    {
      id: 'import-one',
      title: '匯入一個 Word 檔',
      note: '姓名和生日都一樣的幼兒，資料會接到同一位幼兒底下，不會重複新增。',
      steps: [
        { cap: '在首頁按「匯入檔案」', draw: () => homeScreen('匯入檔案') },
        { cap: '選要匯入的 Word 檔（.docx）', draw: () => homeScreen('', { extra: picker([['王小明-適性總表.docx', false, true], ['林小美-適性總表.docx']]) }) },
        { cap: '檢查內容，不要的紀錄取消勾選，按「確認匯入」', draw: m => confirmImport(m, '適性總表') },
        { cap: '匯入完成，資料旁邊會有一個「新」字', draw: () => homeScreen('', { extra: toast('已成功匯入：王小明-適性總表.docx') }) },
      ],
    },
  ],
  html: tip('出現「舊版 .doc 檔」的訊息時，先用 Word 打開那個檔案「另存新檔」成 .docx，再匯入一次。'),
};

/* ---------- 4 課程月計畫 ---------- */

// 指標所屬年齡層: the tier switch above a 指標 picker (月計畫 and 課程計畫表 share it).
const tierSwitch = () => `<span class="ms-field ms-field--bare">指標所屬年齡層</span>${tabs(['7-12個月', '13-18個月', '19-24個月'], '19-24個月')}`;

const planListForm = hitSubmit =>
  aside('新增課程月計畫', field('年月', '115年10月'), `<span class="ms-field ms-field--bare">幼兒</span>${cb('王小明', true)}${cb('林小美', true)}`, actions(btn('新增', 'primary', hitSubmit)));
const planList = (m, { fabHit = false, popup = false, hitSubmit = false } = {}) =>
  listScreen(m, {
    header: { back: '← 返回選擇表單', title: '課程月計畫', actions: btn(pick(m, '課程月計畫匯入', '匯入'), 'purple') },
    list: row('<b>115年09月<small>2 位幼兒</small></b>' + del()),
    form: planListForm(hitSubmit),
    fabHit,
    popup,
  });

// The month calendar: one child at a time, a week of day cells.
const DAYS = [['10/06', ''], ['10/07', 'Ⅴ-1-6【我愛畫畫】'], ['10/08', ''], ['10/09', 'Ⅴ-2-1【積木疊高】'], ['10/10', '']];
const calendar = (m, { hitDay = -1, newItem = false, absent = false } = {}) =>
  `<div class="ms-cal"><div class="ms-cal__kids">${btn('王小明', 'brand')}${btn('林小美')}</div><span class="ms-group">第二週　10/06–10/10</span><div class="ms-cal__week">${DAYS.map(
    ([d, item], i) =>
      `<span class="ms-day"${i === hitDay ? ' data-hit' : ''}><b>${d}</b>${
        i === 1 && absent ? '<em class="ms-struck">戶外教學</em>' : item ? `<em>${item}</em>` : ''
      }${i === 2 && newItem ? '<em class="ms-fill">Ⅴ-3-2【故事時間】</em>' : ''}</span>`
  ).join('')}</div></div>`;
const dayPanel = ({ hitAdd = false, hitAbsent = false, absent = false } = {}) =>
  `<div class="ms-aside"><b>王小明　第二週　10/07</b>${row(
    `${code('Ⅴ-1-6')}<b>【我愛畫畫】</b>${btn('編輯', 'edit')}${del()}`
  )}<div class="ms-cbline">${cb('未達成')}${cb('請假／其他活動代替', absent, hitAbsent)}</div>${absent ? field('', '戶外教學') : ''}${
    hitAdd ? `${tierSwitch()}${field('指標', 'Ⅴ-3-2')}${field('活動名稱', '故事時間')}${actions(btn('新增項目', 'primary', true))}` : ''
  }</div>`;
const planEditor = (m, { hitDay = -1, panel = '', hitExport = false, newItem = false, absent = false } = {}) =>
  screen(
    bar(m, {
      back: '← 返回課程月計畫列表',
      title: '115年10月 課程月計畫',
      actions: btn(pick(m, '管理幼兒', '管理'), 'purple') + btn(pick(m, '匯出 Word', '匯出'), 'purple', hitExport),
    }),
    `<div class="ms-main">${calendar(m, { hitDay, newItem, absent })}${m === 'desk' ? panel : ''}</div>`,
    m === 'phone' && panel ? `<div class="ms-modal"><div class="ms-dialog ms-dialog--form">${panel}</div></div>` : ''
  );

const MONTHLY = {
  id: 'monthly-plan',
  title: '課程月計畫',
  desc: '班級每月的活動安排',
  icon: TYPE_SELECT_ICONS['monthly-plan'],
  tone: 'green',
  demos: [
    {
      id: 'plan-create',
      title: '建立月計畫',
      steps: [
        { cap: '在首頁按「課程月計畫」', draw: () => homeScreen('課程月計畫') },
        ...addSteps({ draw: planList, formCap: '選年月、勾要排課的幼兒，按「新增」' }),
        { cap: '計畫建立好就會直接打開，預設活動已經填好', draw: m => planEditor(m) },
      ],
    },
    {
      id: 'plan-day',
      title: '安排一天的活動',
      note: '活動是同年齡層的幼兒共用的，刪除一個活動，同階段的幼兒都會一起刪掉。',
      steps: [
        { cap: { desk: '按一下日期格子', phone: '在日期格子上連按兩下' }, draw: m => planEditor(m, { hitDay: 2 }) },
        { cap: '選指標、填活動名稱，按「新增項目」', draw: m => planEditor(m, { panel: dayPanel({ hitAdd: true }) }) },
        { cap: '活動加到這一天了', draw: m => planEditor(m, { newItem: true }) },
      ],
    },
    {
      id: 'plan-absent',
      title: '標記某位幼兒請假',
      steps: [
        { cap: '打開那一天，在活動底下勾「請假／其他活動代替」', draw: m => planEditor(m, { panel: dayPanel({ hitAbsent: true }) }) },
        { cap: '可以寫上替代的活動；勾了就自動存好，只影響這位幼兒', draw: m => planEditor(m, { panel: dayPanel({ absent: true }), absent: true }) },
      ],
    },
    {
      id: 'plan-export',
      title: '匯出 Word',
      steps: [
        { cap: { desk: '按右上角的「匯出 Word」', phone: '按右上角的「匯出」' }, draw: m => planEditor(m, { hitExport: true }) },
        { cap: 'Word 檔會存到「下載」資料夾', draw: m => screen(bar(m, { title: '下載' }), download('115年10月課程月計畫.docx')) },
      ],
    },
  ],
};

/* ---------- 5 適性紀錄（家長版） ---------- */

const PR_TABS = ['課程計畫表', '適性發展紀錄表', '行為觀察', '點滴分享'];
const prHeader = (m, { hitCopy = false, hitExport = false, copy = true } = {}) => ({
  back: '← 返回適性紀錄列表',
  title: pick(m, '王小明　Ⅴ 階段 115年10月', '王小明　Ⅴ 階段'),
  actions: (copy ? btn(pick(m, '套用其他幼兒課程計畫', '套用'), 'purple', hitCopy) : '') + btn(pick(m, '匯出 Word', '匯出'), 'purple', hitExport),
});
// The 適性紀錄 editor on one tab, with that tab's add form.
const prEditor = (m, { tab = '課程計畫表', hitTab = false, list = '', form = '', fabHit = false, popup = false, hitCopy = false, hitExport = false, extra = '' }) =>
  screen(
    bar(m, prHeader(m, { hitCopy, hitExport, copy: tab === '課程計畫表' })),
    tabs(PR_TABS, tab, hitTab),
    main(list, m === 'desk' ? form : ''),
    m === 'phone' && !popup ? fab(fabHit) : '',
    m === 'phone' && popup ? `<div class="ms-modal"><div class="ms-dialog ms-dialog--form">${form}</div></div>` : '',
    extra
  );

const planItem = (activity, indicator, occurrences, { hitAdd = false, fill = false, i = 0, form = '' } = {}) =>
  `<div class="ms-item${fill ? ' ms-fill' : ''}" style="--i:${i}"><div class="ms-item__head">${code(indicator)}<b>【${activity}】</b>${btn('編輯', 'edit')}${del()}</div>${occurrences
    .map(([d, label]) => `<span class="ms-occ">${date(d)}${label}</span>`)
    .join('')}${form || btn('＋ 新增實施紀錄', 'outline', hitAdd)}</div>`;
const coursePlan = ({ items = [['我愛畫畫', 'Ⅴ-1-6', [['115/10/07', '已發展○']]]], fill = false, hitAdd = false, form = '' } = {}) =>
  `${group('身體動作')}${items.map(([a, c, occ], i) => planItem(a, c, occ, { hitAdd: hitAdd && i === 0, form: i === 0 ? form : '', fill, i })).join('')}`;
const coursePlanForm = hitSubmit =>
  aside(
    '新增課程計畫項目',
    tierSwitch(),
    field('指標', 'Ⅴ-1-6 能用筆畫出…'),
    field('活動名稱', '我愛畫畫'),
    field('日期', '115/10/07'),
    `<div class="ms-cbline">${radio('○已發展', true)}${radio('△發展中')}</div>`,
    actions(btn('新增', 'primary', hitSubmit))
  );
const occurrenceForm = ({ absent = false, hitAbsent = false, hitSave = false } = {}) =>
  `<div class="ms-inlineform">${field('日期', '115/10/14')}<div class="ms-cbline">${radio('○已發展', !absent)}${radio('△發展中')}</div>${cb('請假／未執行', absent, hitAbsent)}${cb('更換課程')}${actions(btn('儲存', 'primary', hitSave))}</div>`;

const reportListForm = hitSubmit => aside('新增適性紀錄', field('月齡階段', 'Ⅴ（19-24個月）'), field('紀錄年月', '115年10月'), actions(btn('新增', 'primary', hitSubmit)));
const reportList = (m, { fabHit = false, popup = false, hitSubmit = false, rows = '', hitRow = false } = {}) =>
  listScreen(m, {
    header: { back: '← 返回幼兒列表', title: '王小明 的適性紀錄(家長版)' },
    list: rows || row(`<b>Ⅴ 階段<small>115年10月</small></b>${del()}`, { hit: hitRow, fill: !hitRow }),
    form: reportListForm(hitSubmit),
    fabHit,
    popup,
  });
const pickChild = (m, title) =>
  screen(bar(m, { back: '← 返回選擇表單', title: '幼兒列表', actions: btn(pick(m, `${title}匯入`, '匯入'), 'purple') }), main(childRow('王小明', '114/03/05', 19, { hit: true }) + childRow('林小美', '114/05/20', 17)));

const devRecordForm = hitSubmit =>
  aside('新增段落', field('領域', '身體動作'), cb('Ⅴ-1-6【我愛畫畫】', true), field('敘述', '能握筆畫出圓形…'), actions(btn('新增', 'primary', hitSubmit)));
const behaviorForm = hitSubmit => aside('新增行為觀察', field('標題', '分享玩具'), field('敘述', '主動把積木分給同學…'), actions(btn('新增', 'primary', hitSubmit)));
const photoBoxes = (filled, hit) =>
  `<div class="ms-photos">${[1, 2, 3].map(n => `<span class="${filled && n < 3 ? 'on' : ''}"${hit && n === 1 ? ' data-hit' : ''}>${filled && n < 3 ? '' : `照片 ${n}`}</span>`).join('')}</div>`;
const highlightForm = ({ filled = false, hitPhoto = false, hitSubmit = false } = {}) =>
  aside('新增點滴分享', photoBoxes(filled, hitPhoto), field('描述', filled ? '和同學一起蓋城堡' : ''), actions(btn('新增', 'primary', hitSubmit)));

const PARENT_REPORT = {
  id: 'parent-report',
  title: '適性紀錄（家長版）',
  desc: '每月給家長的報告',
  icon: TYPE_SELECT_ICONS['parent-report'],
  tone: 'purple',
  intro: '每位幼兒每個月一份，有四個分頁：課程計畫表、適性發展紀錄表、行為觀察、點滴分享。',
  demos: [
    {
      id: 'pr-create',
      title: '建立一份適性紀錄',
      steps: [
        { cap: '在首頁按「適性紀錄(家長版)」', draw: () => homeScreen('適性紀錄(家長版)') },
        { cap: '按幼兒的名字', draw: m => pickChild(m, '適性紀錄') },
        ...addSteps({ draw: (m, o) => reportList(m, { ...o, rows: muted('目前還沒有適性紀錄') }), formCap: '確認月齡階段和紀錄年月，按「新增」' }),
        { cap: '按這一份打開', draw: m => reportList(m, { hitRow: true }) },
        { cap: '開始填寫', draw: m => prEditor(m, { list: coursePlan(), form: coursePlanForm(false) }) },
      ],
    },
    {
      id: 'pr-course',
      title: '新增課程計畫項目',
      note: '要記錄較早年齡層的指標時，先切換「指標所屬年齡層」再選指標。',
      steps: [
        ...addSteps({
          draw: (m, { fabHit, popup, hitSubmit }) => prEditor(m, { list: '', form: coursePlanForm(hitSubmit), fabHit, popup }),
          formCap: '選指標（活動名稱會自動帶入），填第一次上課的日期，按「新增」',
        }),
        { cap: '項目依領域分組，按領域標題可以展開或收起', draw: m => prEditor(m, { list: coursePlan({ fill: true }), form: coursePlanForm(false) }) },
      ],
    },
    {
      id: 'pr-occurrence',
      title: '記錄每次上課（請假、更換課程）',
      steps: [
        { cap: '又上了這堂課，就按項目下方的「＋ 新增實施紀錄」', draw: m => prEditor(m, { list: coursePlan({ hitAdd: true }), form: coursePlanForm(false) }) },
        { cap: '那天沒上到就勾「請假／未執行」；換了活動就勾「更換課程」', draw: m => prEditor(m, { list: coursePlan({ form: occurrenceForm({ hitAbsent: true }) }), form: coursePlanForm(false) }) },
        { cap: '按「儲存」', draw: m => prEditor(m, { list: coursePlan({ form: occurrenceForm({ absent: true, hitSave: true }) }), form: coursePlanForm(false) }) },
        {
          cap: '紀錄加上去了；匯出時請假的日期會被劃掉',
          draw: m =>
            prEditor(m, { list: coursePlan({ items: [['我愛畫畫', 'Ⅴ-1-6', [['115/10/07', '已發展○'], ['115/10/14', '請假']]]] }), form: coursePlanForm(false) }),
        },
      ],
    },
    {
      id: 'pr-devrecord',
      title: '適性發展紀錄表',
      steps: [
        { cap: '按「適性發展紀錄表」分頁', draw: m => prEditorTabHit(m, '適性發展紀錄表') },
        ...addSteps({
          draw: (m, { fabHit, popup, hitSubmit }) => prEditor(m, { tab: '適性發展紀錄表', list: '', form: devRecordForm(hitSubmit), fabHit, popup }),
          formCap: '選領域、勾要提到的課程、寫敘述，按「新增」',
        }),
        { cap: '一個領域寫一段', draw: m => prEditor(m, { tab: '適性發展紀錄表', list: row('<b>身體動作<small>能握筆畫出圓形…</small></b>' + del(), { fill: true }), form: devRecordForm(false) }) },
      ],
    },
    {
      id: 'pr-behavior',
      title: '行為觀察',
      steps: [
        { cap: '按「行為觀察」分頁', draw: m => prEditorTabHit(m, '行為觀察') },
        ...addSteps({
          draw: (m, { fabHit, popup, hitSubmit }) => prEditor(m, { tab: '行為觀察', list: '', form: behaviorForm(hitSubmit), fabHit, popup }),
          formCap: '填標題（可以不填）和敘述，按「新增」',
        }),
        { cap: '行為觀察加上去了', draw: m => prEditor(m, { tab: '行為觀察', list: row('<b>分享玩具<small>主動把積木分給同學…</small></b>' + del(), { fill: true }), form: behaviorForm(false) }) },
      ],
    },
    {
      id: 'pr-highlights',
      title: '點滴分享（照片）',
      note: '每則最多 3 張照片。存好之後只能刪照片、不能補照片。',
      steps: [
        { cap: '按「點滴分享」分頁', draw: m => prEditorTabHit(m, '點滴分享') },
        { modes: ['phone'], cap: '按右下角藍色的「＋」', draw: m => prEditor(m, { tab: '點滴分享', form: highlightForm(), fabHit: true }) },
        { cap: '按照片框選照片，一次可以選好幾張', draw: m => prEditor(m, { tab: '點滴分享', form: highlightForm({ hitPhoto: true }), popup: true }) },
        { cap: '寫描述，按「新增」', draw: m => prEditor(m, { tab: '點滴分享', form: highlightForm({ filled: true, hitSubmit: true }), popup: true }) },
        {
          cap: '照片和描述加上去了',
          draw: m =>
            prEditor(m, { tab: '點滴分享', list: row(`<span class="ms-thumbs"><i></i><i></i></span><b>和同學一起蓋城堡</b>${del()}`, { fill: true }), form: highlightForm() }),
        },
      ],
    },
    {
      id: 'pr-export',
      title: '匯出 Word',
      note: '內容沒有寫到「今天」「今日」的話，會直接下載。',
      steps: [
        { cap: { desk: '按右上角的「匯出 Word」', phone: '按右上角的「匯出」' }, draw: m => prEditor(m, { list: coursePlan(), form: coursePlanForm(false), hitExport: true }) },
        {
          cap: '寫到「今天」「今日」時會先跳出來，改成日期後按「儲存並匯出」',
          draw: m =>
            prEditor(m, {
              list: coursePlan(),
              form: coursePlanForm(false),
              extra: modal('', `${muted('以下內容含有『今天』或『今日』，可以在這裡修改')}${field('行為觀察｜分享玩具｜內容', '10/14 主動把積木分給同學')}`, btn('儲存並匯出', 'primary', true) + btn('只儲存') + btn('取消', 'ghost')),
            }),
        },
        { cap: 'Word 檔會存到「下載」資料夾', draw: m => screen(bar(m, { title: '下載' }), download('王小明-適性紀錄-115年10月.docx')) },
      ],
    },
  ],
};
// The editor on 課程計畫表, with the tab to switch to ringed.
function prEditorTabHit(m, tab) {
  return screen(
    bar(m, prHeader(m)),
    `<div class="ms-tabs">${PR_TABS.map(t => `<span${t === '課程計畫表' ? ' class="on"' : ''}${t === tab ? ' data-hit' : ''}>${t}</span>`).join('')}</div>`,
    main(coursePlan(), m === 'desk' ? coursePlanForm(false) : ''),
    m === 'phone' ? fab() : ''
  );
}

/* ---------- 6 適性總表 ---------- */

const formListForm = hitSubmit =>
  aside('新增適性總表', field('月齡階段', 'Ⅴ（19-24個月）'), field('紀錄年月', '115年10月'), cb('涵蓋一段期間（跨多個月份）'), actions(btn('新增', 'primary', hitSubmit)));
const formList = (m, { fabHit = false, popup = false, hitSubmit = false, rows = '', hitAggregate = false, hitRow = false } = {}) =>
  listScreen(m, {
    header: { back: '← 返回幼兒列表', title: '王小明 的適性總表', actions: btn(pick(m, '從適性紀錄彙整', '彙整'), 'purple', hitAggregate) },
    list: rows || row(`<b>Ⅴ 階段<small>115年10月　0 筆紀錄</small></b>${del()}`, { hit: hitRow, fill: !hitRow }),
    form: formListForm(hitSubmit),
    fabHit,
    popup,
  });
const DOMAINS = ['身體動作', '社會情緒', '語言溝通', '認知探索', '生活自理', '備註'];
const observationForm = hitSave =>
  `<div class="ms-inlineform">${field('日期', '115/10/07')}<div class="ms-cbline">${radio('○已發展', true)}${radio('△發展中')}${radio('請假')}${radio('更換課程')}</div>${field('', '能穩定地跑步')}${actions(btn('儲存', 'primary', hitSave))}</div>`;
const indicator = ({ hitAdd = false, form = '', saved = false } = {}) =>
  `<div class="ms-item"><div class="ms-item__head">${code('Ⅴ-1-1')}<b>能穩定地走、跑…</b></div>${
    saved ? `<span class="ms-occ ms-fill">${date('115/10/07')}○　能穩定地跑步</span>` : ''
  }${form || btn('＋ 新增觀察紀錄', 'outline', hitAdd)}</div>`;
const formEditor = (m, { body = indicator(), hitExport = false } = {}) =>
  screen(
    bar(m, { back: '← 返回適性總表列表', title: pick(m, '王小明　Ⅴ 階段 115年10月', '王小明　Ⅴ 階段'), actions: btn(pick(m, '匯出 Word', '匯出'), 'purple', hitExport) }),
    m === 'desk' ? tabs(DOMAINS, '身體動作') : '',
    `<div class="ms-main"><div class="ms-list">${m === 'phone' ? `<span class="ms-fold">身體動作 ▾</span>` : ''}${body}${
      m === 'phone' ? DOMAINS.slice(1, 4).map(d => `<span class="ms-fold">${d} ▸</span>`).join('') : ''
    }</div></div>`
  );

const ASSESSMENT = {
  id: 'assessment',
  title: '適性總表',
  desc: '依年齡層的發展觀察總表',
  icon: TYPE_SELECT_ICONS.assessment,
  tone: 'brand',
  intro: '可以自己一筆一筆填，也可以把每個月的適性紀錄直接彙整進來（見「實用技巧」）。',
  demos: [
    {
      id: 'as-create',
      title: '建立一份總表',
      note: '月齡階段會依幼兒今天的年齡自動選好；補登以前的資料時，可以改成當時的階段。',
      steps: [
        { cap: '在首頁按「適性總表」', draw: () => homeScreen('適性總表') },
        { cap: '按幼兒的名字', draw: m => pickChild(m, '適性總表') },
        ...addSteps({ draw: (m, o) => formList(m, { ...o, rows: muted('目前還沒有適性總表') }), formCap: '確認月齡階段和紀錄年月，按「新增」' }),
        { cap: '按這一份打開', draw: m => formList(m, { hitRow: true }) },
        { cap: '開始填寫', draw: m => formEditor(m) },
      ],
    },
    {
      id: 'as-fill',
      title: '填寫觀察紀錄',
      steps: [
        { cap: { desk: '選領域分頁，在指標下按「＋ 新增觀察紀錄」', phone: '展開領域，在指標下按「＋ 新增觀察紀錄」' }, draw: m => formEditor(m, { body: indicator({ hitAdd: true }) }) },
        { cap: '填日期、選狀態、寫觀察敘述，按「儲存」', draw: m => formEditor(m, { body: indicator({ form: observationForm(true) }) }) },
        { cap: '紀錄加上去了', draw: m => formEditor(m, { body: indicator({ saved: true }) }) },
      ],
    },
    {
      id: 'as-export',
      title: '匯出 Word',
      steps: [
        { cap: { desk: '按右上角的「匯出 Word」', phone: '按右上角的「匯出」' }, draw: m => formEditor(m, { hitExport: true }) },
        { cap: 'Word 檔會存到「下載」資料夾，檔名的 A～E 表依年齡層', draw: m => screen(bar(m, { title: '下載' }), download('王小明-D表-115年10月.docx')) },
      ],
    },
  ],
};

/* ---------- 7 實用技巧 ---------- */

const OLD_PLAN = [['自由遊戲', 'Ⅴ-4-1', [['115/10/02', '發展中△']]], ['戶外散步', 'Ⅴ-1-1', [['115/10/04', '已發展○']]]];
const COPIED_PLAN = [
  ['音樂律動', 'Ⅴ-1-2', [['115/10/07', '已發展○']]],
  ['黏土小點心', 'Ⅴ-1-4', [['115/10/09', '已發展○']]],
  ['積木疊高', 'Ⅴ-2-1', [['115/10/14', '已發展○']]],
];
const copyPopup = modal('套用其他幼兒課程計畫', `<span class="ms-field ms-field--bare">幼兒</span>${radio('林小美（3 筆）', true)}`, btn('套用', 'primary', true) + btn('取消'));
const aggregateScreen = (m, { october = false, hitMonth = false, hitGo = false } = {}) =>
  screen(
    bar(m, { back: '← 返回適性總表列表', title: '王小明　從適性紀錄彙整' }),
    `<div class="ms-form">${field('月齡階段', 'Ⅴ 階段')}<span class="ms-field ms-field--bare">選擇要彙整的適性紀錄</span>${cb('115年09月', true)}${cb('115年10月', october, hitMonth)}<span class="ms-field ms-field--bare">彙整方式</span><div class="ms-cbline">${radio('建立新總表')}${radio('合併進現有總表', true)}</div>${field('選擇要合併進去的總表', '115年09月')}${actions(btn('合併進總表', 'primary', hitGo))}</div>`
  );
const TIPS = {
  id: 'tips',
  title: '實用技巧',
  desc: '套用課程計畫、彙整總表、一次匯入多個檔',
  icon: ICONS.tips,
  tone: 'warm',
  demos: [
    {
      id: 'tip-copy',
      title: '套用其他幼兒的課程計畫',
      lead: '同一個月、同一個年齡層的幼兒，課程大多一樣。先做好一位，其他人直接套用，不用一筆一筆重打。',
      note: '日期和說明照抄；○／△ 一律先變成 ○，請假、更換課程不會套用，請再逐筆確認。',
      steps: [
        {
          cap: { desk: '打開王小明的適性紀錄，按上方的「套用其他幼兒課程計畫」', phone: '打開王小明的適性紀錄，按右上角的「套用」' },
          draw: m => prEditor(m, { list: coursePlan({ items: OLD_PLAN }), form: coursePlanForm(false), hitCopy: true }),
        },
        { cap: '選一位同年齡層、同月份的幼兒，按「套用」', draw: m => prEditor(m, { list: coursePlan({ items: OLD_PLAN }), form: coursePlanForm(false), extra: copyPopup }) },
        {
          cap: '提醒原本的課程計畫會被換掉，沒問題就按「確定」',
          draw: m =>
            prEditor(m, {
              list: coursePlan({ items: OLD_PLAN }),
              form: coursePlanForm(false),
              extra: confirmBox('目前這份的 2 筆課程計畫，會換成「林小美」的 3 筆課程計畫。確定要套用嗎？'),
            }),
        },
        { cap: '完成！林小美的課程都複製過來了', draw: m => prEditor(m, { list: coursePlan({ items: COPIED_PLAN, fill: true }), form: coursePlanForm(false) }) },
      ],
    },
    {
      id: 'tip-aggregate',
      title: '把適性紀錄彙整成總表',
      lead: '每個月的適性紀錄做完後，一次把課程計畫表的紀錄搬進適性總表，不用重抄。',
      note: '已經彙整過的紀錄會自動跳過，所以每個月都可以放心再「合併進現有總表」一次。請假、更換課程也會一起帶過去。',
      steps: [
        { cap: { desk: '打開王小明的適性總表列表，按「從適性紀錄彙整」', phone: '打開王小明的適性總表列表，按右上角的「彙整」' }, draw: m => formList(m, { hitAggregate: true, rows: row(`<b>Ⅴ 階段<small>115年09月　8 筆紀錄</small></b>${del()}`) }) },
        { cap: '勾要彙整的月份', draw: m => aggregateScreen(m, { hitMonth: true }) },
        { cap: '選「建立新總表」或「合併進現有總表」，按下方的按鈕', draw: m => aggregateScreen(m, { october: true, hitGo: true }) },
        {
          cap: '有要確認的內容會先列出來，看完按「確認彙整」',
          draw: m =>
            screen(
              bar(m, { back: '← 返回適性總表列表', title: '王小明　從適性紀錄彙整' }),
              `<div class="ms-form"><b>彙整前請先確認以下內容：</b>${warn('將跳過 3 筆重複資料')}${actions(btn('返回修改', 'outline') + btn('確認彙整', 'primary', true))}</div>`
            ),
        },
        { cap: '總表打開了，兩個月的紀錄都在裡面', draw: m => formEditor(m, { body: indicator({ saved: true }) + `<div class="ms-item ms-fill" style="--i:1"><div class="ms-item__head">${code('Ⅴ-1-2')}<b>能協調地跳…</b></div><span class="ms-occ">${date('115/09/16')}○</span><span class="ms-occ">${date('115/10/07')}○</span></div>` }) },
      ],
    },
    {
      id: 'tip-multi',
      title: '一次匯入多個 Word 檔',
      lead: '舊的 Word 檔不用一個一個匯入，可以一次全選。',
      note: '每個檔案都會先讓你確認；不想匯入的那個，按左上角的「← 取消匯入」（手機是「← 取消」）就會跳過它。',
      steps: [
        { cap: '在首頁按「匯入檔案」', draw: () => homeScreen('匯入檔案') },
        { cap: '一次選好幾個 Word 檔', draw: () => homeScreen('', { extra: picker([['王小明-適性紀錄.docx', true], ['林小美-適性紀錄.docx', true, true], ['王小明-適性總表.docx']]) }) },
        { cap: '第一個檔案：檢查後按「確認匯入」', draw: m => confirmImport(m, '適性紀錄', { note: '王小明-適性紀錄.docx' }) },
        { cap: '接著自動換下一個檔案，一樣按「確認匯入」', draw: m => confirmImport(m, '適性紀錄', { name: '林小美', note: '林小美-適性紀錄.docx', extra: toast('已成功匯入：王小明-適性紀錄.docx') }) },
        { cap: '全部匯入完成', draw: () => homeScreen('', { extra: toast('已成功匯入：林小美-適性紀錄.docx') }) },
      ],
    },
  ],
};

/* ---------- 8 資料保存 ---------- */

const backupMenu = (exportHit, importHit) => [['匯出備份', exportHit], ['匯入備份', importHit]];
const BACKUP = {
  id: 'backup',
  title: '資料保存',
  desc: '匯出備份、匯入備份、Google 同步',
  icon: ICONS.backup,
  tone: 'brand',
  intro: '資料只存在這台裝置的瀏覽器裡，請定期匯出備份。',
  demos: [
    {
      id: 'backup-export',
      title: '匯出備份',
      note: '備份檔裡有幼兒的姓名、生日和照片，請存在自己的電腦或隨身碟，不要放在共用的雲端資料夾。',
      steps: [
        { cap: '按畫面最上方的「備份」', draw: () => homeScreen('', { hitBackup: true }) },
        { cap: '按「匯出備份」', draw: () => screen(appTop({ menuItems: backupMenu(true, false) }), '<div class="ms-home"></div>') },
        { cap: '備份檔會存到「下載」資料夾，記得另外存一份', draw: m => screen(bar(m, { title: '下載' }), download('2026-10-04_備份.json')) },
      ],
    },
    {
      id: 'backup-import',
      title: '匯入備份（換電腦時）',
      steps: [
        { cap: '按「備份」→「匯入備份」', draw: () => screen(appTop({ menuItems: backupMenu(false, true) }), '<div class="ms-home"></div>') },
        { cap: '選之前存的備份檔', draw: () => homeScreen('', { extra: modal('選擇檔案', `<span class="ms-pick" data-hit>${file('2026-10-04_備份.json')}</span>`, '') }) },
        { cap: '確認後按「確定」', draw: () => homeScreen('', { extra: confirmBox('匯入備份會清除目前所有資料，確定要繼續嗎？') }) },
        { cap: '頁面會自動重新整理，備份裡的資料都回來了', draw: () => homeScreen() },
      ],
    },
    {
      id: 'google-sync',
      title: 'Google 帳號同步',
      webOnly: true,
      note: '登入 Google 後，上方就不會有「備份」按鈕，資料會自動同步。按「登出」只會停止同步，這台裝置的資料不會刪除。',
      steps: [
        {
          cap: '打開系統時選「使用 Google 登入」',
          draw: () =>
            screen(
              `<div class="ms-form ms-form--center"><b>要讓資料在裝置之間自動同步嗎？</b>${card('使用 Google 登入', { tone: 'brand', desc: '跨裝置自動同步資料', hit: true })}${card('以訪客身份繼續', { desc: '僅存在本機，可手動匯出備份' })}</div>`
            ),
        },
        {
          point: true,
          cap: '之後存檔就會自動同步，上方會顯示上次同步的時間',
          draw: () =>
            screen(
              `<div class="ms-apptop"><b>午安，王老師</b><span class="ms-sync" data-hit>● 上次同步：10:32</span>${btn('立即同步', 'header')}${btn('登出', 'header')}</div>`,
              `<div class="ms-home">${muted('　')}</div>`
            ),
        },
      ],
    },
  ],
  html: tip('「匯入備份」會先清除這台裝置的所有資料，不會合併。換電腦或清除瀏覽器資料前，記得先匯出備份。'),
};

/* ---------- 9 常見問題 ---------- */

const FAQ = {
  id: 'faq',
  title: '常見問題',
  desc: '遇到狀況先看這裡',
  icon: ICONS.faq,
  tone: 'neutral',
  html: `
    <dl class="help-faq">
      <dt>資料不見了？</dt>
      <dd>資料只存在同一台裝置的同一個瀏覽器裡。換了瀏覽器、用無痕視窗或清過瀏覽器資料就看不到，可以用備份檔「匯入備份」救回來。</dd>
      <dt>匯出的 Word 檔在哪？</dt>
      <dd>在「下載」資料夾。手機可以在「檔案」App 裡找。</dd>
      <dt>手機和電腦的資料一樣嗎？</dt>
      <dd>網頁版登入 Google 帳號才會同步；沒登入的話兩邊是分開的。</dd>
      <dt>出現「有新版本」？</dt>
      <dd>先把正在填的內容存好，再按「更新」。</dd>
    </dl>`,
};

export const HELP_CHAPTERS = [START, CHILDREN_CH, IMPORT, MONTHLY, PARENT_REPORT, ASSESSMENT, TIPS, BACKUP, FAQ];
