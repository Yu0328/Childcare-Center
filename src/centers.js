// One entry per 公托 sharing this GitHub Pages site — each gets its own folder
// (/Childcare-Center/<id>/), title, logo (assets/centers/<id>/) and storage. See
// docs/superpowers/specs/2026-10-29-multi-center-design.md. A new centre needs only a new entry
// here plus its two square logos; its dbName/storagePrefix are `c-form-<id>-db`/`c-form-<id>`.
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
];

// scripts/build-web.mjs sets __CENTER_ID__ per centre; the offline build and the tests don't.
const id = typeof __CENTER_ID__ === 'undefined' ? 'yuying' : __CENTER_ID__;
export const CENTER = CENTERS.find(c => c.id === id);
