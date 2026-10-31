// One entry per 公托 sharing this GitHub Pages site — each gets its own folder
// (/Childcare-Center/<id>/), title, logo (assets/centers/<id>/) and storage. See
// docs/superpowers/specs/2026-10-29-multi-center-design.md. A new centre needs only a new entry
// here plus assets/centers/<id>/ (square icon-192.png/icon-512.png, round word-badge.png with
// transparent corners for the Word headers); its dbName/storagePrefix are `c-form-<id>-db`/`c-form-<id>`.
export const CENTERS = [
  {
    id: 'yuying',
    title: '屏東縣內埔鄉育英公托填表系統',
    shortName: '育英公托填表',
    institution: '屏東縣內埔鄉育英公設民營托嬰中心',
    // A whole line of its own, not built from `institution`: the 委託 association may differ.
    monthlyPlanInstitution: '屏東縣內埔鄉育英公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理',
    driveFolderName: '育英公托填表系統',
    // 育英 predates this file: its names are the old ones, so the move keeps its data and sign-in.
    dbName: 'c-form-db',
    storagePrefix: 'c-form',
  },
  {
    id: 'wandan',
    title: '屏東縣萬丹鄉公托填表系統',
    shortName: '萬丹公托填表',
    institution: '屏東縣萬丹鄉公設民營托嬰中心',
    monthlyPlanInstitution: '屏東縣萬丹鄉公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理',
    // 月計畫's pre-filled days ([weekday, activity]); without this a centre gets 育英's
    // 大團體活動 (Mon, Fri) and 節氣 (Tue) — see src/domain/monthlyCoursePlan.js.
    monthlyPlanDefaults: [[1, '戶外活動日'], [2, '節氣'], [5, '團體課']],
    driveFolderName: '屏東縣萬丹鄉公托填表系統',
    dbName: 'c-form-wandan-db',
    storagePrefix: 'c-form-wandan',
  },
  {
    id: 'gongzheng',
    title: '屏東市公正公托填表系統',
    shortName: '公正公托填表',
    institution: '屏東市公正公設民營托嬰中心',
    monthlyPlanInstitution: '屏東市公正公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理',
    driveFolderName: '屏東市公正公托填表系統',
    dbName: 'c-form-gongzheng-db',
    storagePrefix: 'c-form-gongzheng',
  },
  {
    id: 'shoutian',
    title: '高雄市岡山壽天公托填表系統',
    shortName: '壽天公托填表',
    institution: '高雄市岡山壽天公共托嬰中心',
    monthlyPlanInstitution: '高雄市政府社會局委託高雄市嬰幼兒托育協會辦理-高雄市岡山壽天公共托嬰中心',
    // Fri stays open for 適性.
    monthlyPlanDefaults: [[1, '大團體活動'], [2, '節氣'], [3, '大團體活動'], [4, '大團體活動']],
    driveFolderName: '高雄市岡山壽天公托填表系統',
    dbName: 'c-form-shoutian-db',
    storagePrefix: 'c-form-shoutian',
  },
];

// scripts/build-web.mjs sets __CENTER_ID__ per centre; the offline build and the tests don't.
const id = typeof __CENTER_ID__ === 'undefined' ? 'yuying' : __CENTER_ID__;
export const CENTER = CENTERS.find(c => c.id === id);
