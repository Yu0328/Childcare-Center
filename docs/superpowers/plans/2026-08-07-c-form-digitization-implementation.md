# C表數位化系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single self-contained HTML file, opened directly in a browser (Windows/Mac, no install), that lets childcare staff manage children's developmental assessment records (C表) without retyping standardized indicator text, and export each record as a .docx file matching the existing paper/Word format.

**Architecture:** Vanilla JS ES modules under `src/`, bundled by esbuild into one inlined `<script>` + `<style>` block inside `dist/index.html`. Data persists in the browser's IndexedDB; a JSON export/import pair provides manual backup. The 137-indicator reference table (5 age tiers × 5 developmental domains) is static data compiled from the official practice guide, embedded in the bundle — never user-entered. `.docx` export is generated programmatically with the `docx` library, not by serializing the page, so output is byte-deterministic.

**Tech Stack:** Vanilla JavaScript (ES modules), Vitest + jsdom for tests, fake-indexeddb for storage tests, esbuild for the production bundle, `docx` for Word file generation, JSZip (dev-only) to unzip generated `.docx` files in acceptance tests.

## Global Constraints

- Final deliverable is a single file, `dist/index.html` — no external JS/CSS files, no CDN references, no network calls at runtime.
- No backend server; all storage is client-side (IndexedDB) with manual JSON export/import as backup.
- Must run unmodified in current Chrome/Edge/Safari/Firefox on both Windows and Mac.
- All UI copy is Traditional Chinese (Taiwan childcare terminology), matching the source documents already in the repo.
- `.docx` output must structurally match the existing C表 Word format (see `docs/superpowers/specs/2026-08-07-c-form-digitization-design.md`), verified by an automated test that unzips the generated file and checks its content — not just eyeballing it.
- A child may have multiple AssessmentForms for the same tier (one per recording period); tier is auto-suggested from birthdate but always manually overridable per form.
- Indicator reference data (code, description, domain, tier) is read-only static data — never created, edited, or stored per-child.

---

## File Structure

```
package.json
vitest.config.js
scripts/build.mjs              # bundles src/app.js + src/styles.css into dist/index.html
tests/setup.js                 # global test environment: fake-indexeddb polyfill
src/
  app.js                       # entry point: router/view-switcher, mounts to #app
  styles.css                   # all styles
  data/
    indicators.js              # 137-indicator reference DB + TIERS/DOMAINS metadata
  domain/
    ageTier.js                 # birthdate + as-of-date -> month age / suggested tier
  storage/
    db.js                      # IndexedDB CRUD: children, forms, entries
    backup.js                  # export all data to JSON string / restore from JSON string
  export/
    docxExport.js              # build .docx Blob from a form's data; trigger download
  ui/
    childListView.js           # child roster + add-child form
    formListView.js             # a child's list of AssessmentForms + add-form control
    formEditorView.js            # indicator/entry editor + docx export button for one form
tests/
  indicators.test.js
  ageTier.test.js
  db.test.js
  backup.test.js
  docxExport.test.js
  docxExport.acceptance.test.js
  childListView.test.js
  formListView.test.js
  formEditorView.test.js
  app.test.js
```

---

### Task 1: Project scaffold & build tooling

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `tests/setup.js`
- Create: `scripts/build.mjs`
- Create: `src/app.js`
- Create: `src/styles.css`
- Test: `tests/app.test.js`

**Interfaces:**
- Produces: `mountApp(container: HTMLElement): void` — exported from `src/app.js`. Later tasks' UI wiring is added inside this function, but for this task it only needs to render a placeholder so the build pipeline is provably working end-to-end.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "c-form-digitization",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "node scripts/build.mjs"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0",
    "esbuild": "^0.24.0",
    "fake-indexeddb": "^6.0.0",
    "jszip": "^3.10.1"
  },
  "dependencies": {
    "docx": "^9.0.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 3: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
});
```

- [ ] **Step 4: Write `tests/setup.js`**

```js
import 'fake-indexeddb/auto';
```

- [ ] **Step 5: Write the failing test for `mountApp`**

Create `tests/app.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mountApp } from '../src/app.js';

describe('mountApp', () => {
  it('renders into the given container', () => {
    const container = document.createElement('div');
    mountApp(container);
    expect(container.textContent).toContain('C表數位化系統');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/app.test.js`
Expected: FAIL — `src/app.js` does not exist yet.

- [ ] **Step 7: Write minimal `src/app.js`**

```js
export function mountApp(container) {
  container.innerHTML = '<h1>C表數位化系統</h1>';
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  mountApp(document.getElementById('app'));
}
```

- [ ] **Step 8: Write minimal `src/styles.css`**

```css
:root {
  color-scheme: light;
  font-family: -apple-system, "Microsoft JhengHei", "PingFang TC", sans-serif;
}

body {
  margin: 0;
  padding: 1.5rem;
  background: #f7f7f5;
  color: #1f2937;
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run tests/app.test.js`
Expected: PASS

- [ ] **Step 10: Write the build script**

Create `scripts/build.mjs`:

```js
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  write: false,
  target: ['chrome100', 'safari15'],
});

const js = result.outputFiles[0].text;
const css = readFileSync('src/styles.css', 'utf-8');

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>C表數位化系統</title>
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
${js}
</script>
</body>
</html>
`;

writeFileSync('dist/index.html', html);
console.log('Built dist/index.html (%d bytes)', html.length);
```

- [ ] **Step 11: Run the build and verify output**

Run: `npm run build`
Expected: prints `Built dist/index.html (... bytes)`; `dist/index.html` exists and, when opened in a browser, shows an "C表數位化系統" heading.

- [ ] **Step 12: Add `.gitignore` entries and commit**

Append to `.gitignore`:

```
node_modules/
dist/
```

```bash
git add package.json vitest.config.js tests/setup.js tests/app.test.js scripts/build.mjs src/app.js src/styles.css .gitignore
git commit -m "chore: scaffold project with esbuild single-file build and vitest"
```

---

### Task 2: Indicator reference data

**Files:**
- Create: `src/data/indicators.js`
- Test: `tests/indicators.test.js`

**Interfaces:**
- Produces:
  - `TIERS: Array<{ code: string, label: string, minMonths: number, maxMonths: number }>` — 5 entries, ordered Ⅰ→Ⅴ.
  - `DOMAINS: Array<{ id: number, name: string, subdomain: string }>` — 5 entries.
  - `INDICATORS: Array<{ code: string, tier: string, domain: number, domainName: string, subdomain: string, description: string }>` — 137 entries.
  - `getIndicatorsForTier(tierCode: string): Array<Indicator>`
  - `getIndicator(code: string): Indicator | undefined`

- [ ] **Step 1: Write the failing tests**

Create `tests/indicators.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TIERS, DOMAINS, INDICATORS, getIndicatorsForTier, getIndicator } from '../src/data/indicators.js';

describe('indicator reference data', () => {
  it('has 5 tiers in order Ⅰ through Ⅴ', () => {
    expect(TIERS.map(t => t.code)).toEqual(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']);
  });

  it('has 5 domains', () => {
    expect(DOMAINS).toHaveLength(5);
    expect(DOMAINS.map(d => d.name)).toEqual([
      '身體動作', '社會情緒', '語言溝通', '認知探索', '生活自理',
    ]);
  });

  it('has 137 total indicators', () => {
    expect(INDICATORS).toHaveLength(137);
  });

  it('every indicator code matches its tier and domain', () => {
    for (const indicator of INDICATORS) {
      expect(indicator.code.startsWith(`${indicator.tier}-${indicator.domain}-`)).toBe(true);
    }
  });

  it('getIndicatorsForTier returns only that tier, with correct counts per tier', () => {
    expect(getIndicatorsForTier('Ⅰ')).toHaveLength(18);
    expect(getIndicatorsForTier('Ⅱ')).toHaveLength(23);
    expect(getIndicatorsForTier('Ⅲ')).toHaveLength(29);
    expect(getIndicatorsForTier('Ⅳ')).toHaveLength(32);
    expect(getIndicatorsForTier('Ⅴ')).toHaveLength(35);
    for (const indicator of getIndicatorsForTier('Ⅳ')) {
      expect(indicator.tier).toBe('Ⅳ');
    }
  });

  it('getIndicator looks up a known indicator by code', () => {
    expect(getIndicator('Ⅳ-1-1')).toEqual({
      code: 'Ⅳ-1-1',
      tier: 'Ⅳ',
      domain: 1,
      domainName: '身體動作',
      subdomain: '粗動作、精細動作',
      description: '能獨立穩定行走',
    });
  });

  it('getIndicator returns undefined for an unknown code', () => {
    expect(getIndicator('Ⅵ-9-9')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/indicators.test.js`
Expected: FAIL — `src/data/indicators.js` does not exist yet.

- [ ] **Step 3: Write `src/data/indicators.js`**

This is transcribed and cross-checked from《托嬰中心嬰帅兒適性發展活動實務指引》第貳章 表二-7, against the two real sample documents in the repo root (`陳小安C表-2.docx` for tier Ⅳ, `林小晴-115年03月適性紀錄(家長版).docx` for tier Ⅴ). The source PDF's own numbering is missing for several 生活自理 (domain 5) items in tiers Ⅳ and Ⅴ; those were reconstructed from the two sample documents' actual usage and are internally consistent.

```js
const RAW_DOMAINS = [
  {
    domain: 1,
    name: '身體動作',
    subdomain: '粗動作、精細動作',
    byTier: {
      'Ⅰ': [
        '俯臥時可抬起頭及頸部',
        '能雙手碰在一起',
        '能抓握放在手心的物品',
        '能試圖伸手拿眼前物品',
        '能伸展肢體',
      ],
      'Ⅱ': [
        '俯臥時能以手臂撐起胸部',
        '能自己翻身',
        '能在協助下坐穩',
        '能伸手拉或耙抓物品',
        '能搖晃手中的物品',
        '能抬腿碰觸物品',
        '能匍匐移動',
      ],
      'Ⅲ': [
        '能自己坐穩',
        '會撐起身體向前爬行',
        '能在協助下站立與行走',
        '能獨立站立幾秒',
        '能將物品由一手換到另一手',
        '能用拇指配合其他手指鉗握物品',
        '能以雙手拍手',
      ],
      'Ⅳ': [
        '能獨立穩定行走',
        '能保持平衡撿拾地上物品',
        '會拿或拖拉物品行走',
        '能將玩具放入或倒出容器',
        '能翻硬紙板書',
        '能丟擲玩具',
        '能以兩指(拇指、食指)撿拾物品',
      ],
      'Ⅴ': [
        '能獨立地走上樓梯',
        '能奔跑',
        '能原地跳起',
        '能踢球',
        '能堆疊數個小積木',
        '能拿筆塗鴉',
        '能一頁一頁地翻書',
      ],
    },
  },
  {
    domain: 2,
    name: '社會情緒',
    subdomain: '自我概念、社會關係、情緒',
    byTier: {
      'Ⅰ': [
        '能發出社會性微笑',
        '會回應成人的逗弄',
        '會使用如吸拇指或吃奶嘴的方式安撫自己',
      ],
      'Ⅱ': [
        '會玩自己的手腳',
        '對鏡中的自己感興趣',
        '能表現愉悅的情緒',
        '對與人互動表現正向反應',
        '會用簡單方式吸引成人注意',
      ],
      'Ⅲ': [
        '會揮手表示再見',
        '能和成人玩簡單重覆遊戲(如躲貓貓)',
        '能簡單表達自我需求及情緒',
        '能區辨照顧者的語氣及情緒',
        '能與照顧者建立情感依附(如主動伸手要抱)',
        '練習處理陌生人焦慮(例如有陌生人來訪時)',
      ],
      'Ⅳ': [
        '能與別的孩子坐在一起玩',
        '能在提示下做基本社交動作(如謝謝、拜拜)',
        '會對喜愛玩偶表現出疼愛或照顧的行為',
        '會對熟悉成人表達好感(如擁抱親吻)',
        '會用行為或語言表達自主性(如搖頭表示不要)',
        '練習處理分離焦慮',
      ],
      'Ⅴ': [
        '能在照片中或鏡子中認出自己',
        '能參與團體性的活動',
        '能辨識並說出他人不同的情緒',
        '會以自己的名字稱呼自己',
        '會用動作去安慰他人',
        '會說出親友、同伴的名字或稱呼',
        '能認識自己、朋友或家庭成員的照片',
        '會與玩偶對話',
      ],
    },
  },
  {
    domain: 3,
    name: '語言溝通',
    subdomain: '表達性語言、接收性語言、肢體語言',
    byTier: {
      'Ⅰ': [
        '會朝發出聲音的方向轉頭',
        '能注視照顧者的口型變化',
        '會發出聲音自娛',
        '會回應成人的聲音',
      ],
      'Ⅱ': [
        '嚐試發出不同的聲音',
        '能發出聲音回應成人的話語',
        '對熟悉的童謠或音樂有反應',
        '會注視說話的人',
      ],
      'Ⅲ': [
        '能模仿大人的簡單話語(如ㄅㄚㄅㄚ)',
        '在牙牙學語中出現聲量、高低和節奏的變化',
        '會以肢體動作進行溝通(如以手指物或搖頭、點頭)',
        '會與人輪流對話',
        '能理解簡單語彙的意思(如ㄋㄟㄋㄟ)',
      ],
      'Ⅳ': [
        '能講至少十個單字',
        '能結合二個字出現電報式的話語(如狗狗汪汪)',
        '能用語言表達想要的東西',
        '能理解簡單日常生活用語',
        '能指認或說出熟悉物品/動物的名稱',
        '能回答簡單問題',
      ],
      'Ⅴ': [
        '可說出20個以上的字彙',
        '能以短句與他人對話',
        '能說出簡單的身體部位名稱',
        '能自己閱讀圖畫書',
        '聽到喜歡的音樂或歌謠會跟著手舞足蹈或哼唱',
        '練習說疑問句(如問：爸爸呢？)',
      ],
    },
  },
  {
    domain: 4,
    name: '認知探索',
    subdomain: '感官知覺、概念發展、解決問題、創意表現',
    byTier: {
      'Ⅰ': [
        '眼睛能追隨物品移動',
        '對光線及聲量的變化有反應',
        '能對不同觸感有反應',
        '會模仿成人的臉部表情',
        '會探索自己雙手',
      ],
      'Ⅱ': [
        '會重覆進行有目的性的行為(例如重複搖手搖鈴)',
        '能用眼睛搜尋聲音的來源',
        '能模仿簡單的動作',
        '會用嘴巴探索物品',
        '會注視顏色或圖案鮮明的圖片/玩具',
      ],
      'Ⅲ': [
        '會分辨熟悉家人與陌生人',
        '會尋找完全被藏著的物品(保留概念)',
        '能預期事件的發生(如奶瓶出現知道要喝奶了)',
        '呼叫他的名字時會有反應',
        '能設法接近想要的事物',
        '能操作簡單玩具',
      ],
      'Ⅳ': [
        '能遵從簡單的指令',
        '能指認常見物品與簡單身體部位',
        '能配對簡單形狀',
        '能了解常見物品的用途',
        '能以新的方式探索物品的特性',
        '能尋找出指定物品',
      ],
      'Ⅴ': [
        '能分辨冷熱、軟硬、乾濕等',
        '會假裝餵洋娃娃吃東西',
        '能依形狀或顏色分類',
        '能分辨大小',
        '能拼簡單拼圖',
        '對塗顏色活動感興趣',
      ],
    },
  },
  {
    domain: 5,
    name: '生活自理',
    subdomain: '自助技能、健康習慣、清潔衛生',
    byTier: {
      'Ⅰ': [
        '能吸吮奶嘴',
      ],
      'Ⅱ': [
        '會伸手幫忙拿奶瓶',
        '能接受用湯匙餵食',
      ],
      'Ⅲ': [
        '能自己拿住奶瓶進食',
        '能吞嚥糊狀副食品',
        '能自己拿食物吃',
        '能拉下頭上的帽子',
        '會表示要吃東西',
      ],
      'Ⅳ': [
        '能用學習杯喝水',
        '能用吸管喝水',
        '練習用湯匙/叉子',
        '會表示尿濕了或已排便',
        '練習洗手的技巧',
        '能粗略以毛巾擦嘴',
        '練習咀嚼半固態食物',
      ],
      'Ⅴ': [
        '能用湯匙進食',
        '能咀嚼固體食物',
        '能自己脫褲子及鞋子',
        '能在協助下練習穿衣服',
        '能在協助下練習刷牙',
        '能幫忙收拾玩具及物品',
        '能練習做簡單家事(如擦桌子、收碗)',
        '能練習如廁及表達需求',
      ],
    },
  },
];

export const TIERS = [
  { code: 'Ⅰ', label: '0-3個月', minMonths: 0, maxMonths: 3 },
  { code: 'Ⅱ', label: '4-6個月', minMonths: 4, maxMonths: 6 },
  { code: 'Ⅲ', label: '7-12個月', minMonths: 7, maxMonths: 12 },
  { code: 'Ⅳ', label: '13-18個月', minMonths: 13, maxMonths: 18 },
  { code: 'Ⅴ', label: '19-24個月', minMonths: 19, maxMonths: 24 },
];

export const DOMAINS = RAW_DOMAINS.map(({ domain, name, subdomain }) => ({
  id: domain,
  name,
  subdomain,
}));

export const INDICATORS = RAW_DOMAINS.flatMap(({ domain, name, subdomain, byTier }) =>
  Object.entries(byTier).flatMap(([tier, descriptions]) =>
    descriptions.map((description, index) => ({
      code: `${tier}-${domain}-${index + 1}`,
      tier,
      domain,
      domainName: name,
      subdomain,
      description,
    }))
  )
);

export function getIndicatorsForTier(tierCode) {
  return INDICATORS.filter(indicator => indicator.tier === tierCode);
}

export function getIndicator(code) {
  return INDICATORS.find(indicator => indicator.code === code);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/indicators.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/indicators.js tests/indicators.test.js
git commit -m "feat: add 137-indicator reference data for all 5 age tiers"
```

---

### Task 3: Age/tier calculation

**Files:**
- Create: `src/domain/ageTier.js`
- Test: `tests/ageTier.test.js`

**Interfaces:**
- Consumes: `TIERS` from `src/data/indicators.js` (`{ code, minMonths, maxMonths }`).
- Produces:
  - `calculateAgeInMonths(birthDate: string, asOfDate: string): number` — both `YYYY-MM-DD`; whole months elapsed, floored.
  - `suggestTier(birthDate: string, asOfDate: string): string | null` — a `TIERS[].code`, or `null` if the age falls outside 0–24 months.

- [ ] **Step 1: Write the failing tests**

Create `tests/ageTier.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { calculateAgeInMonths, suggestTier } from '../src/domain/ageTier.js';

describe('calculateAgeInMonths', () => {
  it('returns 0 for a newborn on the same day', () => {
    expect(calculateAgeInMonths('2026-01-15', '2026-01-15')).toBe(0);
  });

  it('returns whole months elapsed', () => {
    expect(calculateAgeInMonths('2025-01-07', '2026-03-31')).toBe(14);
  });

  it('does not round up when the day-of-month has not been reached', () => {
    expect(calculateAgeInMonths('2025-01-20', '2026-03-05')).toBe(13);
  });
});

describe('suggestTier', () => {
  it('suggests Ⅰ for a 0-3 month old', () => {
    expect(suggestTier('2026-06-01', '2026-08-01')).toBe('Ⅰ');
  });

  it('suggests Ⅳ for a 13-18 month old (matches the 陳小安 sample)', () => {
    expect(suggestTier('2024-11-01', '2026-03-01')).toBe('Ⅳ');
  });

  it('suggests Ⅴ for a 19-24 month old (matches the 林小晴 sample: born 113.07.19, 19 months at 115.03)', () => {
    expect(suggestTier('2024-07-19', '2026-03-01')).toBe('Ⅴ');
  });

  it('returns null when the child is older than 24 months', () => {
    expect(suggestTier('2023-01-01', '2026-03-01')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ageTier.test.js`
Expected: FAIL — `src/domain/ageTier.js` does not exist yet.

- [ ] **Step 3: Write `src/domain/ageTier.js`**

```js
import { TIERS } from '../data/indicators.js';

export function calculateAgeInMonths(birthDate, asOfDate) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const asOf = new Date(`${asOfDate}T00:00:00`);

  let months = (asOf.getFullYear() - birth.getFullYear()) * 12 + (asOf.getMonth() - birth.getMonth());
  if (asOf.getDate() < birth.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

export function suggestTier(birthDate, asOfDate) {
  const months = calculateAgeInMonths(birthDate, asOfDate);
  const tier = TIERS.find(t => months >= t.minMonths && months <= t.maxMonths);
  return tier ? tier.code : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ageTier.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/ageTier.js tests/ageTier.test.js
git commit -m "feat: add age-in-months and tier suggestion calculation"
```

---

### Task 4: Children storage (IndexedDB)

**Files:**
- Create: `src/storage/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces:
  - `addChild({ name: string, birthDate: string }): Promise<{ id: number, name: string, birthDate: string }>`
  - `listChildren(): Promise<Array<Child>>`
  - `getChild(id: number): Promise<Child | undefined>`
  - `clearAllData(): Promise<void>` — deletes the entire IndexedDB database. Used by tests and, later, by `backup.js` before restoring.

- [ ] **Step 1: Write the failing tests**

Create `tests/db.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { addChild, listChildren, getChild, clearAllData } from '../src/storage/db.js';

describe('children storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('adds a child and assigns it an id', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    expect(child.id).toBeTypeOf('number');
    expect(child.name).toBe('陳小安');
    expect(child.birthDate).toBe('2024-11-01');
  });

  it('lists all added children', async () => {
    await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    await addChild({ name: '林小晴', birthDate: '2024-07-19' });

    const children = await listChildren();
    expect(children.map(c => c.name).sort()).toEqual(['陳小安', '林小晴']);
  });

  it('gets a child by id', async () => {
    const created = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const found = await getChild(created.id);
    expect(found).toEqual(created);
  });

  it('returns undefined for a missing child id', async () => {
    expect(await getChild(999)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db.test.js`
Expected: FAIL — `src/storage/db.js` does not exist yet.

- [ ] **Step 3: Write `src/storage/db.js`**

```js
const DB_NAME = 'c-form-db';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('children')) {
        db.createObjectStore('children', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runRequest(storeName, mode, fn) {
  return openDatabase().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export async function addChild({ name, birthDate }) {
  const id = await runRequest('children', 'readwrite', store => store.add({ name, birthDate }));
  return { id, name, birthDate };
}

export async function listChildren() {
  return runRequest('children', 'readonly', store => store.getAll());
}

export async function getChild(id) {
  return runRequest('children', 'readonly', store => store.get(id));
}

export async function clearAllData() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/db.js tests/db.test.js
git commit -m "feat: add IndexedDB-backed children storage"
```

---

### Task 5: Forms & entries storage

**Files:**
- Modify: `src/storage/db.js`
- Modify: `tests/db.test.js`

**Interfaces:**
- Consumes: existing `openDatabase`/`runRequest` helpers in `db.js` (internal, not exported).
- Produces (added to `db.js`):
  - `addForm({ childId: number, tier: string, period: string }): Promise<{ id: number, childId: number, tier: string, period: string, createdAt: string }>`
  - `listFormsForChild(childId: number): Promise<Array<Form>>`
  - `getForm(id: number): Promise<Form | undefined>`
  - `addEntry({ formId: number, indicatorCode: string, date: string, achieved: boolean, note: string }): Promise<Entry>`
  - `updateEntry(id: number, changes: Partial<Entry>): Promise<Entry>`
  - `deleteEntry(id: number): Promise<void>`
  - `listEntriesForForm(formId: number): Promise<Array<Entry>>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/db.test.js` (add these imports to the existing import line and add a new `describe` block):

```js
import {
  addChild, listChildren, getChild, clearAllData,
  addForm, listFormsForChild, getForm,
  addEntry, updateEntry, deleteEntry, listEntriesForForm,
} from '../src/storage/db.js';

describe('forms and entries storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('adds a form for a child and lists it back', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    expect(form.id).toBeTypeOf('number');
    expect(form.createdAt).toBeTypeOf('string');

    const forms = await listFormsForChild(child.id);
    expect(forms).toEqual([form]);
  });

  it('allows multiple forms for the same child and tier (different periods)', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年02月' });

    const forms = await listFormsForChild(child.id);
    expect(forms).toHaveLength(2);
    expect(forms.map(f => f.period).sort()).toEqual(['115年01月', '115年02月']);
  });

  it('gets a form by id', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const created = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    expect(await getForm(created.id)).toEqual(created);
  });

  it('adds, updates, lists and deletes entries for a form', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const entry = await addEntry({
      formId: form.id,
      indicatorCode: 'Ⅳ-1-1',
      date: '2026-01-07',
      achieved: true,
      note: '可以來回穩定行走',
    });
    expect(entry.id).toBeTypeOf('number');

    let entries = await listEntriesForForm(form.id);
    expect(entries).toEqual([entry]);

    const updated = await updateEntry(entry.id, { note: '可穩定行走至戶外遊戲場' });
    expect(updated.note).toBe('可穩定行走至戶外遊戲場');
    expect(updated.indicatorCode).toBe('Ⅳ-1-1');

    await deleteEntry(entry.id);
    entries = await listEntriesForForm(form.id);
    expect(entries).toEqual([]);
  });

  it('throws when updating a non-existent entry', async () => {
    await expect(updateEntry(999, { note: 'x' })).rejects.toThrow('Entry 999 not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db.test.js`
Expected: FAIL — `addForm`, `listFormsForChild`, `getForm`, `addEntry`, `updateEntry`, `deleteEntry`, `listEntriesForForm` are not exported yet.

- [ ] **Step 3: Modify `src/storage/db.js`**

Update the `onupgradeneeded` handler to also create the `forms` and `entries` stores:

```js
request.onupgradeneeded = () => {
  const db = request.result;
  if (!db.objectStoreNames.contains('children')) {
    db.createObjectStore('children', { keyPath: 'id', autoIncrement: true });
  }
  if (!db.objectStoreNames.contains('forms')) {
    const forms = db.createObjectStore('forms', { keyPath: 'id', autoIncrement: true });
    forms.createIndex('by_childId', 'childId');
  }
  if (!db.objectStoreNames.contains('entries')) {
    const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
    entries.createIndex('by_formId', 'formId');
  }
};
```

Add these exports at the end of the file:

```js
export async function addForm({ childId, tier, period }) {
  const createdAt = new Date().toISOString();
  const id = await runRequest('forms', 'readwrite', store => store.add({ childId, tier, period, createdAt }));
  return { id, childId, tier, period, createdAt };
}

export async function listFormsForChild(childId) {
  return runRequest('forms', 'readonly', store => store.index('by_childId').getAll(childId));
}

export async function getForm(id) {
  return runRequest('forms', 'readonly', store => store.get(id));
}

export async function addEntry({ formId, indicatorCode, date, achieved, note }) {
  const id = await runRequest('entries', 'readwrite', store =>
    store.add({ formId, indicatorCode, date, achieved, note })
  );
  return { id, formId, indicatorCode, date, achieved, note };
}

export async function updateEntry(id, changes) {
  const existing = await runRequest('entries', 'readonly', store => store.get(id));
  if (!existing) {
    throw new Error(`Entry ${id} not found`);
  }
  const updated = { ...existing, ...changes, id };
  await runRequest('entries', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteEntry(id) {
  await runRequest('entries', 'readwrite', store => store.delete(id));
}

export async function listEntriesForForm(formId) {
  return runRequest('entries', 'readonly', store => store.index('by_formId').getAll(formId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/db.js tests/db.test.js
git commit -m "feat: add forms and entries storage, supporting multiple forms per tier"
```

---

### Task 6: Backup export/import

**Files:**
- Create: `src/storage/backup.js`
- Test: `tests/backup.test.js`

**Interfaces:**
- Consumes: `listChildren`, `listFormsForChild`, `listEntriesForForm`, `addChild`, `addForm`, `addEntry`, `clearAllData` from `src/storage/db.js`.
- Produces:
  - `exportBackup(): Promise<string>` — JSON string `{ version: 1, children, forms, entries }`.
  - `importBackup(json: string): Promise<void>` — wipes existing data, then restores from the JSON string. Rejects if `version !== 1`.

- [ ] **Step 1: Write the failing tests**

Create `tests/backup.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { addChild, addForm, addEntry, listChildren, listFormsForChild, listEntriesForForm, clearAllData } from '../src/storage/db.js';
import { exportBackup, importBackup } from '../src/storage/backup.js';

describe('backup export/import', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('exports all data as a JSON string', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

    const json = await exportBackup();
    const data = JSON.parse(json);

    expect(data.version).toBe(1);
    expect(data.children).toHaveLength(1);
    expect(data.forms).toHaveLength(1);
    expect(data.entries).toHaveLength(1);
  });

  it('round-trips through export and import, preserving relationships', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

    const json = await exportBackup();
    await clearAllData();
    await importBackup(json);

    const children = await listChildren();
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe('陳小安');

    const forms = await listFormsForChild(children[0].id);
    expect(forms).toHaveLength(1);
    expect(forms[0].tier).toBe('Ⅳ');

    const entries = await listEntriesForForm(forms[0].id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('可以來回穩定行走');
  });

  it('rejects an unsupported backup version', async () => {
    await expect(importBackup(JSON.stringify({ version: 2, children: [], forms: [], entries: [] })))
      .rejects.toThrow('Unsupported backup version: 2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/backup.test.js`
Expected: FAIL — `src/storage/backup.js` does not exist yet.

- [ ] **Step 3: Write `src/storage/backup.js`**

```js
import {
  listChildren, listFormsForChild, listEntriesForForm,
  addChild, addForm, addEntry, clearAllData,
} from './db.js';

const BACKUP_VERSION = 1;

export async function exportBackup() {
  const children = await listChildren();
  const forms = [];
  const entries = [];

  for (const child of children) {
    const childForms = await listFormsForChild(child.id);
    forms.push(...childForms);
    for (const form of childForms) {
      entries.push(...(await listEntriesForForm(form.id)));
    }
  }

  return JSON.stringify({ version: BACKUP_VERSION, children, forms, entries }, null, 2);
}

export async function importBackup(json) {
  const data = JSON.parse(json);
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${data.version}`);
  }

  await clearAllData();

  const childIdMap = new Map();
  for (const child of data.children) {
    const created = await addChild({ name: child.name, birthDate: child.birthDate });
    childIdMap.set(child.id, created.id);
  }

  const formIdMap = new Map();
  for (const form of data.forms) {
    const created = await addForm({
      childId: childIdMap.get(form.childId),
      tier: form.tier,
      period: form.period,
    });
    formIdMap.set(form.id, created.id);
  }

  for (const entry of data.entries) {
    await addEntry({
      formId: formIdMap.get(entry.formId),
      indicatorCode: entry.indicatorCode,
      date: entry.date,
      achieved: entry.achieved,
      note: entry.note,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/backup.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/backup.js tests/backup.test.js
git commit -m "feat: add JSON backup export/import"
```

---

### Task 7: docx row-building logic

**Files:**
- Create: `src/export/docxExport.js`
- Test: `tests/docxExport.test.js`

**Interfaces:**
- Produces: `buildIndicatorRows(indicators: Array<Indicator>, entriesByIndicatorCode: Record<string, Array<Entry>>): Array<{ code, description, date, achieved, note }>` — one row per entry; an indicator with no entries yields exactly one blank row.

- [ ] **Step 1: Write the failing tests**

Create `tests/docxExport.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildIndicatorRows } from '../src/export/docxExport.js';

const indicators = [
  { code: 'Ⅳ-1-1', description: '能獨立穩定行走' },
  { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品' },
];

describe('buildIndicatorRows', () => {
  it('emits one blank row for an indicator with no entries', () => {
    const rows = buildIndicatorRows(indicators, {});
    expect(rows).toEqual([
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '', achieved: false, note: '' },
      { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品', date: '', achieved: false, note: '' },
    ]);
  });

  it('emits one row per entry, preserving indicator order', () => {
    const entriesByIndicatorCode = {
      'Ⅳ-1-1': [
        { date: '2026-01-07', achieved: true, note: '可以來回穩定行走' },
        { date: '2026-02-26', achieved: true, note: '可穩定行走至戶外遊戲場' },
      ],
    };

    const rows = buildIndicatorRows(indicators, entriesByIndicatorCode);

    expect(rows).toEqual([
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' },
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '2026-02-26', achieved: true, note: '可穩定行走至戶外遊戲場' },
      { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品', date: '', achieved: false, note: '' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/docxExport.test.js`
Expected: FAIL — `src/export/docxExport.js` does not exist yet.

- [ ] **Step 3: Write `src/export/docxExport.js`**

```js
export function buildIndicatorRows(indicators, entriesByIndicatorCode) {
  const rows = [];

  for (const indicator of indicators) {
    const entries = entriesByIndicatorCode[indicator.code] || [];

    if (entries.length === 0) {
      rows.push({ code: indicator.code, description: indicator.description, date: '', achieved: false, note: '' });
      continue;
    }

    for (const entry of entries) {
      rows.push({
        code: indicator.code,
        description: indicator.description,
        date: entry.date,
        achieved: entry.achieved,
        note: entry.note,
      });
    }
  }

  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/docxExport.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/export/docxExport.js tests/docxExport.test.js
git commit -m "feat: add docx table row builder with dynamic per-indicator rows"
```

---

### Task 8: docx document generation & download

**Files:**
- Modify: `src/export/docxExport.js`
- Modify: `tests/docxExport.test.js`

**Interfaces:**
- Consumes: `buildIndicatorRows` (same file), `Document`, `Packer`, `Paragraph`, `Table`, `TableRow`, `TableCell`, `TextRun`, `WidthType` from the `docx` package.
- Produces:
  - `generateDocxBlob({ child: { name, birthDate }, form: { tier, period }, indicators: Array<Indicator>, entries: Array<Entry & { indicatorCode }> }): Promise<Blob>`
  - `downloadDocx(blob: Blob, filename: string): void` — browser-only DOM side effect (creates and clicks an `<a>`).

- [ ] **Step 1: Write the failing test**

Append to `tests/docxExport.test.js`:

```js
import { generateDocxBlob } from '../src/export/docxExport.js';

describe('generateDocxBlob', () => {
  it('produces a non-empty .docx blob', async () => {
    const indicators = [
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', domainName: '身體動作', subdomain: '粗動作、精細動作' },
    ];
    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' },
    ];

    const blob = await generateDocxBlob({
      child: { name: '陳小安', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators,
      entries,
    });

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/docxExport.test.js`
Expected: FAIL — `generateDocxBlob` is not exported yet.

- [ ] **Step 3: Modify `src/export/docxExport.js`**

Add these imports at the top:

```js
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType } from 'docx';
```

Add at the end of the file:

```js
function formatDateCell(row) {
  if (!row.date) return '';
  return row.achieved ? `${row.date}○` : row.date;
}

function headerRow() {
  const headers = ['發展領域', '領域範疇', '指標項次', '發展活動', '課程實施日期', '課程實施記錄'];
  return new TableRow({
    children: headers.map(
      text => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] })
    ),
  });
}

export async function generateDocxBlob({ child, form, indicators, entries }) {
  const entriesByIndicatorCode = {};
  for (const entry of entries) {
    if (!entriesByIndicatorCode[entry.indicatorCode]) {
      entriesByIndicatorCode[entry.indicatorCode] = [];
    }
    entriesByIndicatorCode[entry.indicatorCode].push(entry);
  }

  const indicatorByCode = new Map(indicators.map(indicator => [indicator.code, indicator]));
  const rows = buildIndicatorRows(indicators, entriesByIndicatorCode);

  const bodyRows = rows.map(row => {
    const indicator = indicatorByCode.get(row.code);
    const cells = [
      indicator.domainName,
      indicator.subdomain,
      row.code,
      row.description,
      formatDateCell(row),
      row.note,
    ];
    return new TableRow({
      children: cells.map(text => new TableCell({ children: [new Paragraph(text)] })),
    });
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow(), ...bodyRows],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph(`幼兒姓名：${child.name}　出生日期：${child.birthDate}`),
          new Paragraph(`月齡階段：${form.tier}　紀錄年月：${form.period}`),
          table,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadDocx(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/docxExport.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/export/docxExport.js tests/docxExport.test.js
git commit -m "feat: generate .docx blob matching the C表 table format"
```

---

### Task 9: Child list UI

**Files:**
- Create: `src/ui/childListView.js`
- Test: `tests/childListView.test.js`

**Interfaces:**
- Consumes: `addChild`, `listChildren` from `src/storage/db.js`.
- Produces: `renderChildListView(container: HTMLElement, { onSelectChild: (child) => void }): Promise<void>` — clears `container`, renders the roster and an add-child form, re-renders itself after a successful add.

- [ ] **Step 1: Write the failing tests**

Create `tests/childListView.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { renderChildListView } from '../src/ui/childListView.js';

describe('renderChildListView', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('renders existing children', async () => {
    await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    expect(container.textContent).toContain('陳小安');
  });

  it('adds a new child via the form and re-renders the list', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    container.querySelector('[data-field="name"]').value = '林小晴';
    container.querySelector('[data-field="birthDate"]').value = '2024-07-19';
    container.querySelector('[data-action="add-child"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(container.textContent).toContain('林小晴');
  });

  it('calls onSelectChild with the clicked child', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    let selected = null;
    await renderChildListView(container, { onSelectChild: c => { selected = c; } });

    container.querySelector(`[data-child-id="${child.id}"]`).click();

    expect(selected).toEqual(child);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/childListView.test.js`
Expected: FAIL — `src/ui/childListView.js` does not exist yet.

- [ ] **Step 3: Write `src/ui/childListView.js`**

```js
import { addChild, listChildren } from '../storage/db.js';

export async function renderChildListView(container, { onSelectChild }) {
  const children = await listChildren();

  container.innerHTML = `
    <h2>幼兒列表</h2>
    <ul class="child-list">
      ${children
        .map(child => `<li><button type="button" data-child-id="${child.id}">${child.name}（出生日期：${child.birthDate}）</button></li>`)
        .join('')}
    </ul>
    <form data-action="add-child">
      <h3>新增幼兒</h3>
      <label>姓名 <input data-field="name" required></label>
      <label>出生日期 <input data-field="birthDate" type="date" required></label>
      <button type="submit">新增</button>
    </form>
  `;

  for (const child of children) {
    container.querySelector(`[data-child-id="${child.id}"]`).addEventListener('click', () => onSelectChild(child));
  }

  container.querySelector('[data-action="add-child"]').addEventListener('submit', async event => {
    event.preventDefault();
    const name = container.querySelector('[data-field="name"]').value;
    const birthDate = container.querySelector('[data-field="birthDate"]').value;
    await addChild({ name, birthDate });
    await renderChildListView(container, { onSelectChild });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/childListView.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/childListView.js tests/childListView.test.js
git commit -m "feat: add child list view with add-child form"
```

---

### Task 10: Form list UI (per child)

**Files:**
- Create: `src/ui/formListView.js`
- Test: `tests/formListView.test.js`

**Interfaces:**
- Consumes: `addForm`, `listFormsForChild` from `src/storage/db.js`; `suggestTier` from `src/domain/ageTier.js`; `TIERS` from `src/data/indicators.js`.
- Produces: `renderFormListView(container: HTMLElement, { child, onSelectForm: (form) => void, onBack: () => void }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `tests/formListView.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild, addForm } from '../src/storage/db.js';
import { renderFormListView } from '../src/ui/formListView.js';

describe('renderFormListView', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('renders existing forms for the child', async () => {
    await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('Ⅳ');
    expect(container.textContent).toContain('115年01月');
  });

  it('pre-selects the tier suggested by the child’s current age', async () => {
    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {} });

    const tierSelect = container.querySelector('[data-field="tier"]');
    expect(tierSelect.value).not.toBe('');
  });

  it('allows overriding the tier and creates a second form for the same tier', async () => {
    const container = document.createElement('div');
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {} });

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="period"]').value = '115年01月';
    container.querySelector('[data-action="add-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="period"]').value = '115年02月';
    container.querySelector('[data-action="add-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(container.textContent).toContain('115年01月');
    expect(container.textContent).toContain('115年02月');
  });

  it('calls onSelectForm with the clicked form', async () => {
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const container = document.createElement('div');
    let selected = null;
    await renderFormListView(container, { child, onSelectForm: f => { selected = f; }, onBack: () => {} });

    container.querySelector(`[data-form-id="${form.id}"]`).click();

    expect(selected).toEqual(form);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/formListView.test.js`
Expected: FAIL — `src/ui/formListView.js` does not exist yet.

- [ ] **Step 3: Write `src/ui/formListView.js`**

```js
import { addForm, listFormsForChild } from '../storage/db.js';
import { suggestTier } from '../domain/ageTier.js';
import { TIERS } from '../data/indicators.js';

export async function renderFormListView(container, { child, onSelectForm, onBack }) {
  const forms = await listFormsForChild(child.id);
  const today = new Date().toISOString().slice(0, 10);
  const suggested = suggestTier(child.birthDate, today);

  container.innerHTML = `
    <button type="button" data-action="back">← 返回幼兒列表</button>
    <h2>${child.name} 的評量表</h2>
    <ul class="form-list">
      ${forms
        .map(form => `<li><button type="button" data-form-id="${form.id}">${form.tier} 階段　${form.period}</button></li>`)
        .join('')}
    </ul>
    <form data-action="add-form">
      <h3>新增評量表</h3>
      <label>
        月齡階段
        <select data-field="tier">
          ${TIERS.map(t => `<option value="${t.code}" ${t.code === suggested ? 'selected' : ''}>${t.code}（${t.label}）</option>`).join('')}
        </select>
      </label>
      <label>紀錄年月 <input data-field="period" placeholder="例如 115年01月" required></label>
      <button type="submit">新增</button>
    </form>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  for (const form of forms) {
    container.querySelector(`[data-form-id="${form.id}"]`).addEventListener('click', () => onSelectForm(form));
  }

  container.querySelector('[data-action="add-form"]').addEventListener('submit', async event => {
    event.preventDefault();
    const tier = container.querySelector('[data-field="tier"]').value;
    const period = container.querySelector('[data-field="period"]').value;
    await addForm({ childId: child.id, tier, period });
    await renderFormListView(container, { child, onSelectForm, onBack });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/formListView.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/formListView.js tests/formListView.test.js
git commit -m "feat: add per-child form list view with tier auto-suggest and override"
```

---

### Task 11: Form editor UI

**Files:**
- Create: `src/ui/formEditorView.js`
- Test: `tests/formEditorView.test.js`

**Interfaces:**
- Consumes: `getIndicatorsForTier` from `src/data/indicators.js`; `addEntry`, `updateEntry`, `deleteEntry`, `listEntriesForForm` from `src/storage/db.js`; `generateDocxBlob`, `downloadDocx` from `src/export/docxExport.js`.
- Produces: `renderFormEditorView(container: HTMLElement, { child, form, onBack: () => void }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `tests/formEditorView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild, addForm, addEntry, listEntriesForForm } from '../src/storage/db.js';
import { renderFormEditorView } from '../src/ui/formEditorView.js';

describe('renderFormEditorView', () => {
  let child;
  let form;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
  });

  it('renders every indicator for the form’s tier, grouped with its domain', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    expect(container.textContent).toContain('Ⅳ-1-1');
    expect(container.textContent).toContain('能獨立穩定行走');
    expect(container.textContent).toContain('身體動作');
  });

  it('renders existing entries under their indicator', async () => {
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    expect(container.textContent).toContain('可以來回穩定行走');
  });

  it('adds a new entry for an indicator via its inline form', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const addButton = container.querySelector('[data-add-entry-for="Ⅳ-1-1"]');
    addButton.click();

    container.querySelector('[data-entry-field="date"][data-indicator-code="Ⅳ-1-1"]').value = '2026-01-07';
    container.querySelector('[data-entry-field="achieved"][data-indicator-code="Ⅳ-1-1"]').checked = true;
    container.querySelector('[data-entry-field="note"][data-indicator-code="Ⅳ-1-1"]').value = '可以來回穩定行走';
    container.querySelector('[data-entry-save-for="Ⅳ-1-1"]').click();

    await new Promise(resolve => setTimeout(resolve, 0));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('可以來回穩定行走');
    expect(container.textContent).toContain('可以來回穩定行走');
  });

  it('deletes an entry', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector(`[data-delete-entry="${entry.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(0);
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    const onBack = vi.fn();
    await renderFormEditorView(container, { child, form, onBack });

    container.querySelector('[data-action="back"]').click();

    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/formEditorView.test.js`
Expected: FAIL — `src/ui/formEditorView.js` does not exist yet.

- [ ] **Step 3: Write `src/ui/formEditorView.js`**

```js
import { getIndicatorsForTier } from '../data/indicators.js';
import { addEntry, deleteEntry, listEntriesForForm } from '../storage/db.js';
import { generateDocxBlob, downloadDocx } from '../export/docxExport.js';

function entryRow(entry) {
  return `
    <li>
      ${entry.date}${entry.achieved ? '○' : ''}　${entry.note}
      <button type="button" data-delete-entry="${entry.id}">刪除</button>
    </li>
  `;
}

function indicatorBlock(indicator, entries) {
  return `
    <div class="indicator-block" data-indicator-code="${indicator.code}">
      <h4>${indicator.code}　${indicator.description}</h4>
      <ul class="entry-list">${entries.map(entryRow).join('')}</ul>
      <button type="button" data-add-entry-for="${indicator.code}">新增觀察紀錄</button>
      <div class="entry-form" data-entry-form-for="${indicator.code}" hidden>
        <input type="date" data-entry-field="date" data-indicator-code="${indicator.code}">
        <label><input type="checkbox" data-entry-field="achieved" data-indicator-code="${indicator.code}"> 已達成</label>
        <input type="text" data-entry-field="note" data-indicator-code="${indicator.code}" placeholder="觀察敘述">
        <button type="button" data-entry-save-for="${indicator.code}">儲存</button>
      </div>
    </div>
  `;
}

export async function renderFormEditorView(container, { child, form, onBack }) {
  const indicators = getIndicatorsForTier(form.tier);
  const entries = await listEntriesForForm(form.id);

  const entriesByIndicatorCode = {};
  for (const entry of entries) {
    (entriesByIndicatorCode[entry.indicatorCode] ??= []).push(entry);
  }

  const domainNames = [...new Set(indicators.map(i => i.domainName))];

  container.innerHTML = `
    <button type="button" data-action="back">← 返回評量表列表</button>
    <h2>${child.name}　${form.tier} 階段　${form.period}</h2>
    <button type="button" data-action="export">匯出 Word</button>
    ${domainNames
      .map(
        domainName => `
          <section>
            <h3>${domainName}</h3>
            ${indicators
              .filter(i => i.domainName === domainName)
              .map(indicator => indicatorBlock(indicator, entriesByIndicatorCode[indicator.code] || []))
              .join('')}
          </section>
        `
      )
      .join('')}
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  container.querySelector('[data-action="export"]').addEventListener('click', async () => {
    const blob = await generateDocxBlob({ child, form, indicators, entries: await listEntriesForForm(form.id) });
    downloadDocx(blob, `${child.name}-${form.tier}表-${form.period}.docx`);
  });

  for (const indicator of indicators) {
    container.querySelector(`[data-add-entry-for="${indicator.code}"]`).addEventListener('click', () => {
      container.querySelector(`[data-entry-form-for="${indicator.code}"]`).hidden = false;
    });

    container.querySelector(`[data-entry-save-for="${indicator.code}"]`).addEventListener('click', async () => {
      const date = container.querySelector(`[data-entry-field="date"][data-indicator-code="${indicator.code}"]`).value;
      const achieved = container.querySelector(`[data-entry-field="achieved"][data-indicator-code="${indicator.code}"]`).checked;
      const note = container.querySelector(`[data-entry-field="note"][data-indicator-code="${indicator.code}"]`).value;
      await addEntry({ formId: form.id, indicatorCode: indicator.code, date, achieved, note });
      await renderFormEditorView(container, { child, form, onBack });
    });
  }

  for (const entry of entries) {
    container.querySelector(`[data-delete-entry="${entry.id}"]`).addEventListener('click', async () => {
      await deleteEntry(entry.id);
      await renderFormEditorView(container, { child, form, onBack });
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/formEditorView.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/formEditorView.js tests/formEditorView.test.js
git commit -m "feat: add form editor view with per-indicator entry CRUD and docx export"
```

---

### Task 12: App shell, navigation, and backup buttons

**Files:**
- Modify: `src/app.js`
- Modify: `tests/app.test.js`

**Interfaces:**
- Consumes: `renderChildListView` from `src/ui/childListView.js`; `renderFormListView` from `src/ui/formListView.js`; `renderFormEditorView` from `src/ui/formEditorView.js`; `exportBackup`, `importBackup` from `src/storage/backup.js`.
- Produces: `mountApp(container: HTMLElement): void` (signature unchanged from Task 1; behavior replaced).

- [ ] **Step 1: Write the failing tests**

Replace the contents of `tests/app.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { mountApp } from '../src/app.js';

describe('mountApp navigation', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('starts on the child list', async () => {
    const container = document.createElement('div');
    mountApp(container);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(container.textContent).toContain('幼兒列表');
  });

  it('navigates child list -> form list -> form editor -> back -> back', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    mountApp(container);
    await new Promise(resolve => setTimeout(resolve, 0));

    container.querySelector(`[data-child-id="${child.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.textContent).toContain('的評量表');

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="period"]').value = '115年01月';
    container.querySelector('[data-action="add-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    container.querySelector('[data-form-id]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.textContent).toContain('Ⅳ-1-1');

    container.querySelector('[data-action="back"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.textContent).toContain('的評量表');

    container.querySelector('[data-action="back"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.textContent).toContain('幼兒列表');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app.test.js`
Expected: FAIL — `mountApp` still renders the Task 1 placeholder.

- [ ] **Step 3: Rewrite `src/app.js`**

```js
import { renderChildListView } from './ui/childListView.js';
import { renderFormListView } from './ui/formListView.js';
import { renderFormEditorView } from './ui/formEditorView.js';
import { exportBackup, importBackup } from './storage/backup.js';

export function mountApp(container) {
  function showChildList() {
    renderChildListView(container, {
      onSelectChild: child => showFormList(child),
    });
  }

  function showFormList(child) {
    renderFormListView(container, {
      child,
      onSelectForm: form => showFormEditor(child, form),
      onBack: showChildList,
    });
  }

  function showFormEditor(child, form) {
    renderFormEditorView(container, {
      child,
      form,
      onBack: () => showFormList(child),
    });
  }

  showChildList();
}

export function wireBackupControls({ exportButton, importInput }) {
  exportButton.addEventListener('click', async () => {
    const json = await exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `c-form-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    const text = await file.text();
    await importBackup(text);
    window.location.reload();
  });
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  mountApp(document.getElementById('app'));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Add backup buttons to `index.html`'s shell**

Modify `scripts/build.mjs`'s HTML template so the body includes backup controls alongside the app mount point, and wires them after mount:

```js
const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>C表數位化系統</title>
<style>
${css}
</style>
</head>
<body>
<header>
  <button type="button" id="export-backup">匯出備份</button>
  <label>匯入備份 <input type="file" id="import-backup" accept="application/json"></label>
</header>
<div id="app"></div>
<script>
${js}
document.addEventListener('DOMContentLoaded', () => {
  if (window.wireBackupControls) {
    window.wireBackupControls({
      exportButton: document.getElementById('export-backup'),
      importInput: document.getElementById('import-backup'),
    });
  }
});
</script>
</body>
</html>
`;
```

Since esbuild's `iife` format does not expose module exports globally by default, add a `globalName` option so `wireBackupControls` is reachable from the inline script:

```js
const result = await esbuild.build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  globalName: 'CFormApp',
  write: false,
  target: ['chrome100', 'safari15'],
});
```

And update the inline script's reference:

```js
document.addEventListener('DOMContentLoaded', () => {
  CFormApp.wireBackupControls({
    exportButton: document.getElementById('export-backup'),
    importInput: document.getElementById('import-backup'),
  });
});
```

- [ ] **Step 6: Rebuild and smoke-check**

Run: `npm run build`
Expected: `dist/index.html` is produced with no build errors.

- [ ] **Step 7: Commit**

```bash
git add src/app.js tests/app.test.js scripts/build.mjs
git commit -m "feat: wire child list -> form list -> form editor navigation and backup controls"
```

---

### Task 13: Acceptance test against the real C表 sample, and usage notes

**Files:**
- Test: `tests/docxExport.acceptance.test.js`
- Create: `README.md`

**Interfaces:**
- Consumes: `generateDocxBlob` from `src/export/docxExport.js`; `getIndicatorsForTier` from `src/data/indicators.js`; JSZip (dev dependency) to inspect the generated `.docx` file's contents.

This task is the automated stand-in for the design spec's "驗收方式": rebuild a subset of the real `陳小安C表-2.docx` sample's data (already transcribed in this conversation — see indicators Ⅳ-1-1 and Ⅳ-1-2 with their exact recorded dates and notes) through the app's own data model, export it, and assert the generated file actually contains that content rather than eyeballing it manually.

- [ ] **Step 1: Write the acceptance test**

Create `tests/docxExport.acceptance.test.js`:

```js
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { getIndicatorsForTier } from '../src/data/indicators.js';
import { generateDocxBlob } from '../src/export/docxExport.js';

describe('docx export acceptance (matches 陳小安C表-2.docx sample data)', () => {
  it('includes every recorded indicator, date, and note from the sample', async () => {
    const indicators = getIndicatorsForTier('Ⅳ');

    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' },
      { indicatorCode: 'Ⅳ-1-1', date: '2026-02-26', achieved: true, note: '可穩定行走至戶外遊戲場' },
      { indicatorCode: 'Ⅳ-1-2', date: '2026-01-07', achieved: true, note: '穩定蹲下拿起地上的書本' },
      { indicatorCode: 'Ⅳ-1-2', date: '2026-02-26', achieved: true, note: '可穩定蹲下拿起地上的小石頭' },
    ];

    const blob = await generateDocxBlob({
      child: { name: '陳小安', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators,
      entries,
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml').async('text');

    expect(documentXml).toContain('陳小安');
    expect(documentXml).toContain('Ⅳ-1-1');
    expect(documentXml).toContain('能獨立穩定行走');
    expect(documentXml).toContain('可以來回穩定行走');
    expect(documentXml).toContain('可穩定行走至戶外遊戲場');
    expect(documentXml).toContain('Ⅳ-1-2');
    expect(documentXml).toContain('穩定蹲下拿起地上的書本');

    // Every Ⅳ-tier indicator must appear at least once, even ones with no entries in this test.
    for (const indicator of indicators) {
      expect(documentXml).toContain(indicator.code);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/docxExport.acceptance.test.js`
Expected: PASS. If it fails, compare the failing assertion against the transcribed sample data in Task 2's `src/data/indicators.js` comment and this conversation's earlier extraction of `陳小安C表-2.docx` — do not loosen the assertion to make it pass.

- [ ] **Step 3: Write `README.md`**

```markdown
# C表數位化系統

親子館嬰幼兒發展評量紀錄表（C表）數位化工具。單一 HTML 檔案，雙擊即可用瀏覽器開啟，Windows/Mac 皆可用，不需安裝任何軟體。

## 使用

打開 `dist/index.html` 即可使用。資料存在瀏覽器本機資料庫；請定期用畫面上方的「匯出備份」下載一份備份檔案，需要還原時用「匯入備份」讀回。

## 開發

```bash
npm install
npm test          # 執行所有測試
npm run build      # 產生 dist/index.html
```

設計文件：`docs/superpowers/specs/2026-08-07-c-form-digitization-design.md`
```

- [ ] **Step 4: Run the full test suite one more time**

Run: `npm test`
Expected: all tests across every file PASS.

- [ ] **Step 5: Final build**

Run: `npm run build`
Expected: `dist/index.html` builds cleanly.

- [ ] **Step 6: Commit**

```bash
git add tests/docxExport.acceptance.test.js README.md
git commit -m "test: add docx export acceptance test against real C表 sample data; add README"
```

---

## Self-Review Notes

- **Spec coverage:** child/form/entry data model (Tasks 4–5), 137-indicator static reference DB sourced from the guide (Task 2), age auto-suggest with manual override (Task 3, wired into UI in Task 10), multiple forms per child+tier (Task 5, explicitly tested), IndexedDB storage + JSON backup (Tasks 4–6, wired into UI in Task 12), dynamic per-entry docx rows with a blank row for untouched indicators (Task 7), deterministic programmatic docx generation (Task 8), single-file build (Task 1 and Task 12 Step 5–6), acceptance check against real sample data (Task 13).
- **Non-goals confirmed absent:** no photo upload, no parent-report generation, no multi-user sync, no other form types — none of the 13 tasks touch these.
- **Naming consistency checked:** `addChild/listChildren/getChild`, `addForm/listFormsForChild/getForm`, `addEntry/updateEntry/deleteEntry/listEntriesForForm`, `clearAllData`, `exportBackup/importBackup`, `calculateAgeInMonths/suggestTier`, `getIndicatorsForTier/getIndicator`, `buildIndicatorRows/generateDocxBlob/downloadDocx` are each defined once and referenced identically by every later task that consumes them.
