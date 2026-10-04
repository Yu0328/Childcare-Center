// Static text for the 操作說明 screen (src/ui/helpView.js). Each task is a row of mini screens —
// simplified drawings of the real screen, the button to press ringed — with a short caption
// under each. Labels must match what the app actually shows. Example names only (王小明).

const WEB_ONLY = '<p class="help-webonly">此功能僅網頁版提供</p>';
const sectionTitle = ({ id, title }) => `<h3 class="help-section-title" id="help-section-${id}">${title}</h3>`;
const tip = text => `<p class="help-tip">${text}</p>`;
const chip = (label, variant) => `<span class="help-chip${variant ? ` help-chip--${variant}` : ''}">${label}</span>`;

// Mini-screen pieces. `hl` rings the thing to press.
const btn = (label, variant = '', hl = false) =>
  `<span class="help-ui-btn${variant ? ` help-ui-btn--${variant}` : ''}${hl ? ' help-hl' : ''}">${label}</span>`;
const press = (label, variant) => btn(label, variant, true);
const card = (label, variant = '', hl = false, desc = '') =>
  `<span class="help-ui-card${variant ? ` help-ui-card--${variant}` : ''}${hl ? ' help-hl' : ''}">${label}${desc ? `<small>${desc}</small>` : ''}</span>`;
const field = (label, value = '') =>
  `<span class="help-ui-field${value ? ' help-ui-field--filled' : ''}"${value ? ` data-value="${value}"` : ''}>${label}</span>`;
const check = (label, checked = false, hl = false) => `<span class="help-ui-check${hl ? ' help-hl' : ''}">${checked ? '☑' : '☐'} ${label}</span>`;
const radio = (label, checked = false) => `<span class="help-ui-check">${checked ? '◉' : '○'} ${label}</span>`;
const row = (...items) => `<div class="help-ui-row">${items.join('')}</div>`;
const rowEnd = (...items) => `<div class="help-ui-row help-ui-row--end">${items.join('')}</div>`;
const panel = (title, ...items) => `<div class="help-ui-panel"><span class="help-ui-panel__title">${title}</span>${items.join('')}</div>`;
// `ring` only when switching to that tab is the step.
const tabs = (active, { ring = false, list = ['課程計畫表', '適性發展紀錄表', '行為觀察', '點滴分享'] } = {}) =>
  `<div class="help-ui-tabs">${list
    .map(t => `<span${t === active ? ` class="is-active${ring ? ' help-hl' : ''}"` : ''}>${t}</span>`)
    .join('')}</div>`;
const file = name => `<span class="help-ui-file">${name}</span>`;
const muted = text => `<span class="help-ui-muted">${text}</span>`;
const shot = (title, ...body) => `<div class="help-shot"><div class="help-shot__bar">${title}</div><div class="help-shot__body">${body.join('')}</div></div>`;
const popup = (title, ...body) =>
  `<div class="help-shot help-shot--popup"><div class="help-shot__bar">${title}</div><div class="help-shot__body">${panel(...body)}</div></div>`;
// steps: [[miniScreenHtml, caption], ...]
const flow = (title, steps) => `
  <figure class="help-flow">
    ${title ? `<figcaption class="help-flow__title">${title}</figcaption>` : ''}
    <ol class="help-flow__steps">
      ${steps.map(([screen, caption]) => `<li class="help-flow__step">${screen}<p class="help-flow__caption">${caption}</p></li>`).join('')}
    </ol>
  </figure>`;

// The home screen with one card ringed.
const home = ringed =>
  shot(
    '首頁',
    row(card('管理幼兒', 'rose', ringed === '管理幼兒'), card('匯入檔案', 'rose', ringed === '匯入檔案')),
    card('適性總表', 'brand', ringed === '適性總表'),
    card('適性紀錄(家長版)', 'purple', ringed === '適性紀錄(家長版)'),
    card('課程月計畫', 'green', ringed === '課程月計畫')
  );
const childList = shot('幼兒列表', card('王小明', '', true, '114/03/05 · 19 個月'), card('林小美', '', false, '114/05/20 · 17 個月'));

const START_SECTIONS = [
  { id: 'home', title: '首頁有什麼' },
  { id: 'install', title: '加到主畫面' },
];
const PARENT_REPORT_SECTIONS = [
  { id: 'create', title: '建立一份適性紀錄' },
  { id: 'course-plan', title: '課程計畫表' },
  { id: 'copy-plan', title: '套用其他幼兒課程計畫' },
  { id: 'records', title: '適性發展紀錄、行為觀察' },
  { id: 'highlights', title: '點滴分享' },
  { id: 'export', title: '匯出 Word' },
];
const ASSESSMENT_SECTIONS = [
  { id: 'assessment-create', title: '建立一份總表' },
  { id: 'assessment-fill', title: '填寫觀察紀錄' },
  { id: 'aggregate', title: '從適性紀錄彙整' },
  { id: 'assessment-export', title: '匯出 Word' },
];
const BACKUP_SECTIONS = [
  { id: 'backup-export', title: '匯出備份' },
  { id: 'backup-import', title: '匯入備份' },
  { id: 'google-sync', title: 'Google 帳號同步' },
];

const [secHome, secInstall] = START_SECTIONS;
const [prCreate, prCoursePlan, prCopy, prRecords, prHighlights, prExport] = PARENT_REPORT_SECTIONS;
const [asCreate, asFill, asAggregate, asExport] = ASSESSMENT_SECTIONS;
const [bkExport, bkImport, bkSync] = BACKUP_SECTIONS;

export const HELP_CHAPTERS = [
  {
    id: 'start',
    title: '開始使用',
    sections: START_SECTIONS,
    html: `
      ${sectionTitle(secHome)}
      ${flow('', [
        [
          shot(
            '首頁',
            row(card('管理幼兒', 'rose', false, '新增／刪除幼兒'), card('匯入檔案', 'rose', false, '匯入舊 Word 檔')),
            card('適性總表', 'brand', false, '依年齡層的觀察總表'),
            card('適性紀錄(家長版)', 'purple', false, '每月給家長的報告'),
            card('課程月計畫', 'green', false, '班級每月活動')
          ),
          '按最上方的系統名稱，隨時回到首頁',
        ],
      ])}
      ${tip(`打完字一定要按 ${chip('新增', 'primary')} 或 ${chip('儲存', 'primary')}，沒按就離開，內容不會留下。`)}

      ${sectionTitle(secInstall)}
      ${WEB_ONLY}
      ${flow('iPhone（Safari）', [
        [shot('Safari', rowEnd(press('分享 ⬆'))), '按「分享」'],
        [popup('', '選單', press('加入主畫面')), '按「加入主畫面」'],
      ])}
      ${flow('Android（Chrome）', [
        [shot('Chrome', rowEnd(press('⋮'))), '按右上角 ⋮'],
        [popup('', '選單', press('加到主畫面')), '按「加到主畫面」'],
      ])}
      ${flow('電腦（Chrome／Edge）', [
        [shot('網址列', row(muted('https://…'), press('⊕ 安裝'))), '按網址列右邊的安裝圖示'],
        [popup('', '安裝應用程式？', rowEnd(press('安裝', 'primary'))), '按「安裝」'],
      ])}
    `,
  },
  {
    id: 'children',
    title: '管理幼兒',
    html: `
      ${flow('新增幼兒', [
        [home('管理幼兒'), '按「管理幼兒」'],
        [shot('新增幼兒', field('姓名', '王小明'), field('出生日期', '114年 3月 5日'), rowEnd(press('新增', 'primary'))), '填姓名、生日，按「新增」'],
        [shot('幼兒列表', card('王小明', '', false, '114/03/05 · 19 個月')), '完成'],
      ])}
      ${flow('刪除幼兒', [
        [shot('幼兒列表', row(card('王小明', '', false, '114/03/05'), press('×', 'danger'))), '按名字右邊的 ×'],
        [popup('', '會刪除這位幼兒的所有資料', rowEnd(btn('取消'), press('確定', 'primary'))), '按「確定」'],
      ])}
      ${tip('姓名和生日不能修改。打錯請刪除後重新新增，最好在開始填表前就檢查。')}
    `,
  },
  {
    id: 'import',
    title: '匯入舊的 Word 檔',
    html: `
      <p class="help-intro">適性總表、適性紀錄、課程月計畫都能匯入，系統會自己認出是哪一種。</p>
      ${flow('', [
        [home('匯入檔案'), '按「匯入檔案」'],
        [shot('選擇檔案', file('王小明-C表.docx'), file('王小明-適性紀錄.docx')), '選 Word 檔，可一次選多個'],
        [
          shot('確認匯入內容', field('姓名', '王小明'), check('Ⅴ-1-1 10/07', true), check('Ⅴ-2-3 10/14', true), rowEnd(press('確認匯入', 'primary'))),
          '檢查後按「確認匯入」',
        ],
      ])}
    `,
  },
  {
    id: 'monthly-plan',
    title: '課程月計畫',
    html: `
      ${flow('建立月計畫', [
        [home('課程月計畫'), '按「課程月計畫」'],
        [shot('新增課程月計畫', field('年月', '115年10月'), check('王小明', true), check('林小美', true), rowEnd(press('新增', 'primary'))), '選年月、勾幼兒，按「新增」'],
      ])}
      ${flow('安排活動', [
        [
          shot('115年10月 課程月計畫', row(btn('王小明', 'brand'), btn('林小美')), `<div class="help-ui-grid">${'<span></span>'.repeat(7)}<span class="help-hl"></span>${'<span></span>'.repeat(7)}</div>`),
          '按日期格子（手機按兩下）',
        ],
        [shot('這天的計畫', field('指標'), field('活動名稱'), rowEnd(press('新增項目', 'primary'))), '選指標，按「新增項目」'],
      ])}
      ${flow('標記某位幼兒', [
        [shot('這天的計畫', panel('Ⅴ-1-6【我愛畫畫】', check('未達成'), check('請假／其他活動代替', true, true), field('', '替代活動內容'))), '勾選後自動儲存，只影響目前選的幼兒'],
      ])}
      ${flow('匯出 Word', [
        [shot('115年10月 課程月計畫', rowEnd(btn('管理幼兒', 'purple'), press('匯出 Word', 'purple'))), '按「匯出 Word」'],
        [file('115年10月課程月計畫.docx'), '存到「下載」資料夾'],
      ])}
    `,
  },
  {
    id: 'parent-report',
    title: '適性紀錄（家長版）',
    sections: PARENT_REPORT_SECTIONS,
    html: `
      ${sectionTitle(prCreate)}
      ${flow('', [
        [home('適性紀錄(家長版)'), '按「適性紀錄(家長版)」'],
        [childList, '按幼兒名字'],
        [shot('新增適性紀錄', field('月齡階段', 'Ⅴ（19-24個月）'), field('紀錄年月', '115年10月'), rowEnd(press('新增', 'primary'))), '確認階段、年月，按「新增」'],
      ])}

      ${sectionTitle(prCoursePlan)}
      ${flow('', [
        [
          shot('新增課程計畫項目', tabs('19-24個月', { list: ['13-18個月', '19-24個月'] }), field('指標', 'Ⅴ-1-6'), field('日期', '10/07'), row(radio('○已發展', true), radio('△發展中')), rowEnd(press('新增', 'primary'))),
          '選指標、填日期，按「新增」',
        ],
        [shot('課程計畫表', panel('Ⅴ-1-6【我愛畫畫】', muted('10/07 已發展○'), press('＋ 新增實施紀錄'))), '下次上課再按「＋ 新增實施紀錄」'],
        [shot('實施紀錄', field('日期', '10/14'), check('請假／未執行'), check('更換課程'), rowEnd(press('儲存', 'primary'))), '沒上到課就勾「請假」或「更換課程」'],
      ])}

      ${sectionTitle(prCopy)}
      ${flow('同月份、同年齡層的幼兒，可以整份複製課程計畫', [
        [shot('王小明　Ⅴ 階段', rowEnd(press('套用', 'purple'), btn('匯出 Word', 'purple')), tabs('課程計畫表')), '按「套用其他幼兒課程計畫」'],
        [popup('', '套用其他幼兒課程計畫', radio('林小美（5 筆）', true), rowEnd(btn('取消'), press('套用', 'primary'))), '選一位幼兒，按「套用」'],
        [popup('', '原本的課程計畫會被換掉', rowEnd(btn('取消'), press('確定', 'primary'))), '按「確定」，再逐筆修改'],
      ])}

      ${sectionTitle(prRecords)}
      ${flow('', [
        [shot('適性紀錄', tabs('適性發展紀錄表', { ring: true }), field('領域', '身體動作'), check('Ⅴ-1-6【我愛畫畫】', true), field('敘述'), rowEnd(press('新增', 'primary'))), '選領域、勾要提到的課程，寫敘述'],
        [shot('適性紀錄', tabs('行為觀察', { ring: true }), field('標題（可不填）'), field('敘述'), rowEnd(press('新增', 'primary'))), '寫行為觀察，按「新增」'],
      ])}

      ${sectionTitle(prHighlights)}
      ${flow('', [
        [shot('適性紀錄', tabs('點滴分享', { ring: true }), '<div class="help-ui-photos"><span class="help-hl">＋</span><span>＋</span><span>＋</span></div>', field('描述'), rowEnd(press('新增', 'primary'))), '放照片（最多 3 張）、寫描述'],
      ])}

      ${sectionTitle(prExport)}
      ${flow('', [
        [shot('王小明　Ⅴ 階段', rowEnd(press('匯出 Word', 'purple')), tabs('課程計畫表')), '按「匯出 Word」'],
        [popup('', '內容含有「今天」', field('', '今天一起畫畫…'), rowEnd(btn('只儲存'), press('儲存並匯出', 'primary'))), '寫到「今天」會先請你改'],
        [file('王小明-適性紀錄-115年10月.docx'), '存到「下載」資料夾'],
      ])}
    `,
  },
  {
    id: 'assessment',
    title: '適性總表',
    sections: ASSESSMENT_SECTIONS,
    html: `
      ${sectionTitle(asCreate)}
      ${flow('', [
        [home('適性總表'), '按「適性總表」'],
        [childList, '按幼兒名字'],
        [shot('新增適性總表', field('月齡階段', 'Ⅴ（19-24個月）'), field('紀錄年月', '115年10月'), rowEnd(press('新增', 'primary'))), '確認階段、年月，按「新增」'],
      ])}

      ${sectionTitle(asFill)}
      ${flow('', [
        [shot('王小明　Ⅴ 階段', tabs('身體動作', { list: ['身體動作', '社會情緒', '語言溝通', '備註'] }), panel('Ⅴ-1-1', muted('能穩定地跑步'), press('＋ 新增觀察紀錄'))), '在指標下按「＋ 新增觀察紀錄」'],
        [shot('觀察紀錄', field('日期', '10/07'), row(radio('○已發展', true), radio('△發展中')), row(radio('請假'), radio('更換課程')), field('觀察敘述'), rowEnd(press('儲存', 'primary'))), '選狀態、寫敘述，按「儲存」'],
      ])}

      ${sectionTitle(asAggregate)}
      ${flow('把每月的適性紀錄合併成總表，不用重抄', [
        [shot('王小明 的適性總表', rowEnd(press('從適性紀錄彙整', 'purple'))), '按「從適性紀錄彙整」'],
        [shot('從適性紀錄彙整', check('115年09月', true), check('115年10月', true), radio('建立新總表'), radio('合併進現有總表', true), rowEnd(press('合併進總表', 'primary'))), '勾月份、選方式，按下方按鈕'],
      ])}
      <p class="help-intro">已經彙整過的資料會自動跳過，每個月都可以再「合併進現有總表」一次。</p>

      ${sectionTitle(asExport)}
      ${flow('', [
        [shot('王小明　Ⅴ 階段', rowEnd(press('匯出 Word', 'purple'))), '按「匯出 Word」'],
        [file('王小明-D表-115年10月.docx'), '存到「下載」資料夾'],
      ])}
    `,
  },
  {
    id: 'backup',
    title: '資料保存',
    sections: BACKUP_SECTIONS,
    html: `
      <p class="help-intro">資料只存在這台裝置的瀏覽器裡，請定期匯出備份。</p>
      ${sectionTitle(bkExport)}
      ${flow('', [
        [shot('畫面最上方', rowEnd(press('備份 ▾', 'brand')), panel('', press('匯出備份'), btn('匯入備份'))), '按「備份」→「匯出備份」'],
        [file('2026-10-04_備份.json'), '存到隨身碟或自己的電腦'],
      ])}

      ${sectionTitle(bkImport)}
      ${flow('', [
        [shot('畫面最上方', rowEnd(press('備份 ▾', 'brand')), panel('', btn('匯出備份'), press('匯入備份'))), '按「備份」→「匯入備份」'],
        [shot('選擇檔案', file('2026-10-04_備份.json')), '選備份檔'],
        [popup('', '會清除目前所有資料', rowEnd(btn('取消'), press('確定', 'primary'))), '按「確定」'],
      ])}
      ${tip('匯入備份會先清除這台裝置的所有資料，不會合併。換電腦或清除瀏覽器資料前，記得先匯出備份。')}

      ${sectionTitle(bkSync)}
      ${WEB_ONLY}
      ${flow('登入後，電腦和手機的資料會自動同步', [
        [shot('要讓資料在裝置之間自動同步嗎？', card('使用 Google 登入', 'brand', true), card('以訪客身份繼續')), '選「使用 Google 登入」'],
        [shot('畫面最上方', row(muted('上次同步：10:32'), btn('立即同步', 'brand'))), '之後存檔就會自動同步'],
      ])}
    `,
  },
  {
    id: 'faq',
    title: '常見問題',
    html: `
      <dl class="help-faq">
        <dt>資料不見了？</dt>
        <dd>資料只存在同一台裝置的同一個瀏覽器裡。換了瀏覽器、用無痕視窗或清過瀏覽器資料就看不到，可以用備份檔「匯入備份」救回來。</dd>
        <dt>匯出的 Word 檔在哪？</dt>
        <dd>在「下載」資料夾。</dd>
        <dt>手機和電腦的資料一樣嗎？</dt>
        <dd>網頁版登入 Google 帳號才會同步，沒登入的話兩邊是分開的。</dd>
        <dt>出現「有新版本」？</dt>
        <dd>先把正在填的內容存好，再按「更新」。</dd>
      </dl>
    `,
  },
];
