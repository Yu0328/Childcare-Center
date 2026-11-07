// Fictional demo data for the tutorial recordings (recording date fixed at 2026-11-16, 115年11月).
// Shaped as a version-3 app backup so it loads through the app's own importBackup.
// Course-plan activity names / indicator text are filled from src/data/indicators.js by seedEntry.js.
// Nothing here may contain 今天／今日 — the 適性紀錄 export check would pop up where it isn't meant to.

const T = '2026-11-01T09:00:00.000Z';
const stamp = uid => ({ uid, updatedAt: T, createdAt: T });

export const CHILDREN = [
  { id: 1, name: '王小明', birthDate: '2024-12-15' }, // Ⅴ — main child
  { id: 2, name: '林小美', birthDate: '2025-01-02' }, // Ⅴ — source for 套用其他幼兒課程計畫
  { id: 3, name: '陳小華', birthDate: '2025-02-20' }, // Ⅴ — her 總表 is imported on camera
  { id: 4, name: '張小安', birthDate: '2025-08-10' }, // Ⅳ — a second tier in the list
  { id: 5, name: '黃小寶', birthDate: '2025-04-09' }, // Ⅴ — deleted on camera
];

// Added on camera in 管理幼兒, so not seeded.
export const NEW_CHILD = { name: '李小樂', birthDate: '2025-03-08' };

// [reportId, indicatorCode, [[date, status, absent, note], ...]]
const COURSE = [
  // 王小明 115年10月: ○ on some indicators, △ on others, so the 月計畫 picker shows all three colours.
  [1, 'Ⅴ-1-1', [['2026-10-06', 'developed', false, '能扶著欄杆一步一步走上樓梯。'], ['2026-10-20', 'developed', false, '上下樓梯更穩了。']]],
  [1, 'Ⅴ-1-6', [['2026-10-08', 'developing', false, '握筆時還需要老師協助。']]],
  [1, 'Ⅴ-2-1', [['2026-10-13', 'developed', false, '會說出自己的名字。'], ['2026-10-27', 'developed', true, '']]],
  [1, 'Ⅴ-3-1', [['2026-10-15', 'developing', false, '聽到指令後能指出部分身體部位。']]],
  // 林小美 115年11月: a full month that 王小明's report copies on camera.
  [2, 'Ⅴ-1-2', [['2026-11-03', 'developed', false, '能雙腳離地跳起。'], ['2026-11-17', 'developed', false, '跳得更高了。']]],
  [2, 'Ⅴ-1-6', [['2026-11-05', 'developed', false, '能用蠟筆畫出線條。'], ['2026-11-19', 'developing', false, '嘗試畫圓。']]],
  [2, 'Ⅴ-2-2', [['2026-11-10', 'developed', false, '會主動和同伴打招呼。']]],
  [2, 'Ⅴ-4-1', [['2026-11-12', 'developed', false, '願意嘗試新的食物。'], ['2026-11-26', 'developed', false, '吃飯時會自己拿湯匙。']]],
];

function buildCourse() {
  const coursePlanEntries = [];
  const courseOccurrences = [];
  COURSE.forEach(([reportId, indicatorCode, occurrences], i) => {
    const entryId = i + 1;
    coursePlanEntries.push({ id: entryId, reportId, indicatorCode, ...stamp(`demo-cpe-${entryId}`) });
    occurrences.forEach(([date, status, absent, note], j) => {
      courseOccurrences.push({ id: entryId * 10 + j, entryId, date, status, absent, courseChanged: false, note, ...stamp(`demo-occ-${entryId}-${j}`) });
    });
  });
  return { coursePlanEntries, courseOccurrences };
}

const { coursePlanEntries, courseOccurrences } = buildCourse();

export const BACKUP = {
  version: 3,
  children: CHILDREN.map(c => ({ ...c, ...stamp(`demo-child-${c.id}`) })),
  forms: [],
  entries: [],
  parentReports: [
    { id: 1, childId: 1, tier: 'Ⅴ', period: '115年10月', ...stamp('demo-pr-1') },
    { id: 2, childId: 2, tier: 'Ⅴ', period: '115年11月', ...stamp('demo-pr-2') },
  ],
  coursePlanEntries,
  courseOccurrences,
  developmentRecordEntries: [
    { id: 1, reportId: 1, domain: 1, courseEntryIds: [1, 2], narrative: '小明這個月很喜歡爬樓梯，上下樓梯越來越穩；握筆畫畫時還在練習中。', ...stamp('demo-dev-1') },
    { id: 2, reportId: 2, domain: 1, courseEntryIds: [5, 6], narrative: '小美跳躍和畫線都很有興趣，常常主動拿蠟筆畫畫。', ...stamp('demo-dev-2') },
  ],
  behaviorObservations: [
    { id: 1, reportId: 1, title: '分享玩具', narrative: '小明會把手上的積木遞給旁邊的同伴。', ...stamp('demo-beh-1') },
  ],
  highlightEntries: [],
  monthlyCoursePlans: [],
  planSlots: [],
  planSlotItems: [],
  childItemOverrides: [],
};

// 陳小華's old 總表 (115年09月), turned into a Word file by seedEntry.js and imported on camera.
export const IMPORT_FORM = {
  childName: '陳小華',
  tier: 'Ⅴ',
  period: '115年09月',
  entries: [
    ['Ⅴ-1-1', '2026-09-08', 'developed', '能自己走上小樓梯。'],
    ['Ⅴ-2-1', '2026-09-15', 'developing', '叫名字時會轉頭回應。'],
    ['Ⅴ-4-1', '2026-09-22', 'developed', '會自己用杯子喝水。'],
  ],
};
