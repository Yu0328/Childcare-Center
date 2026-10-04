// 操作說明's chapters, shown by helpView.js. Pure static data — no user data ever goes in here,
// so `html` is trusted and rendered as-is. A chapter's `sections` are listed under it in the
// table of contents; each needs a matching <h3 class="help-section-title" id="help-section-${id}">
// in its `html`. A `help-webonly` element marks a web-only feature and is removed in the hosted
// (web) build, where the feature exists.
export const HELP_CHAPTERS = [
  {
    id: 'start',
    title: '開始使用',
    html: `
      <p class="help-intro">認識首頁上的每個按鈕，並把本系統加到手機或電腦的主畫面。</p>
      <p class="help-webonly">此功能僅網頁版提供</p>
    `,
  },
  {
    id: 'children',
    title: '管理幼兒',
    html: `
      <p class="help-intro">新增或刪除幼兒的資料。</p>
    `,
  },
  {
    id: 'import',
    title: '匯入舊的 Word 檔',
    html: `
      <p class="help-intro">把以前用 Word 填好的表單匯入本系統。</p>
    `,
  },
  {
    id: 'monthly-plan',
    title: '課程月計畫',
    html: `
      <p class="help-intro">安排班級每個月的活動，並匯出 Word 檔。</p>
    `,
  },
  {
    id: 'parent-report',
    title: '適性紀錄（家長版）',
    sections: [
      { id: 'create', title: '建立一份適性紀錄' },
      { id: 'course-plan', title: '課程計畫表' },
      { id: 'copy-plan', title: '套用其他幼兒課程計畫' },
      { id: 'records', title: '適性發展紀錄、行為觀察' },
      { id: 'highlights', title: '點滴分享' },
      { id: 'export', title: '匯出 Word' },
    ],
    html: `
      <p class="help-intro">每個月給家長的適性紀錄。</p>
      <h3 class="help-section-title" id="help-section-create">建立一份適性紀錄</h3>
      <h3 class="help-section-title" id="help-section-course-plan">課程計畫表</h3>
      <h3 class="help-section-title" id="help-section-copy-plan">套用其他幼兒課程計畫</h3>
      <h3 class="help-section-title" id="help-section-records">適性發展紀錄、行為觀察</h3>
      <h3 class="help-section-title" id="help-section-highlights">點滴分享</h3>
      <h3 class="help-section-title" id="help-section-export">匯出 Word</h3>
    `,
  },
  {
    id: 'assessment',
    title: '適性總表',
    html: `
      <p class="help-intro">依年齡層記錄幼兒的發展觀察，也可以從適性紀錄彙整而來。</p>
    `,
  },
  {
    id: 'backup',
    title: '資料保存',
    html: `
      <p class="help-intro">備份資料，換電腦或清除瀏覽器前一定要先做。</p>
      <p class="help-webonly">此功能僅網頁版提供</p>
    `,
  },
  {
    id: 'faq',
    title: '常見問題',
    html: `
      <p class="help-intro">遇到問題時，先看看這裡。</p>
    `,
  },
];
