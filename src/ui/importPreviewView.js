import { addChild, listChildren, addForm, addEntry } from '../storage/db.js';
import { TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml, parsePeriod, combinedPeriod, splitPeriodRange } from './periodFields.js';

function entryRow(entry, index) {
  const unresolved = !entry.description;
  return `
    <li class="import-preview__entry${unresolved ? ' import-preview__entry--warning' : ''}">
      <label>
        <input type="checkbox" data-entry-include="${index}" checked>
        <span class="import-preview__entry-code">${escapeHtml(entry.indicatorCode)}</span>
        ${entry.description ? escapeHtml(entry.description) : '（無法對應到系統指標，建議取消勾選）'}
        —
        ${escapeHtml(entry.date)}${entry.achieved ? '○' : '△'}
        <span class="import-preview__entry-note">${escapeHtml(entry.note)}</span>
      </label>
    </li>
  `;
}

export function renderImportPreviewView(container, { parsed, onCancel, onImported }) {
  const defaultRocYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;
  const { start: parsedStart, end: parsedEnd } = splitPeriodRange(parsed.period);
  const { year: parsedYear, month: parsedMonth } = parsePeriod(parsedStart);
  const { year: parsedEndYear, month: parsedEndMonth } = parsePeriod(parsedEnd);
  const parsedIsRange = parsedStart !== parsedEnd;

  container.innerHTML = `
    <div class="page-header">
      <button type="button" class="btn btn--ghost" data-action="cancel">← 取消匯入</button>
      <h2 class="page-header__title">確認匯入內容</h2>
    </div>
    ${
      parsed.warnings.length > 0
        ? `<ul class="import-preview__warnings">
            ${parsed.warnings.map(warning => `<li class="field-error">${escapeHtml(warning)}</li>`).join('')}
          </ul>`
        : ''
    }
    <form class="panel-form" data-action="confirm-import">
      <h3 class="panel-form__title">幼兒基本資料</h3>
      <label class="panel-form__field">姓名 <input data-field="name" value="${escapeHtml(parsed.child.name ?? '')}" required></label>
      <label class="panel-form__field">出生日期 <input data-field="birthDate" type="date" value="${escapeHtml(parsed.child.birthDate ?? '')}" required></label>
      <label class="panel-form__field">
        月齡階段
        <select data-field="tier">
          ${TIERS.map(t => `<option value="${t.code}" ${t.code === parsed.tier ? 'selected' : ''}>${t.code}（${t.label}）</option>`).join('')}
        </select>
      </label>
      <label class="panel-form__field">
        紀錄年月
        ${periodSelectsHtml({
          yearFieldName: 'period-year',
          monthFieldName: 'period-month',
          selectedYear: parsedYear ?? defaultRocYear,
          selectedMonth: parsedMonth ?? defaultMonth,
        })}
      </label>
      <label class="entry-form__checkbox">
        <input type="checkbox" data-field="period-is-range" ${parsedIsRange ? 'checked' : ''}> 涵蓋一段期間（跨多個月份）
      </label>
      <label class="panel-form__field" data-field-group="period-end" ${parsedIsRange ? '' : 'hidden'}>
        至
        ${periodSelectsHtml({
          yearFieldName: 'period-end-year',
          monthFieldName: 'period-end-month',
          selectedYear: parsedEndYear ?? parsedYear ?? defaultRocYear,
          selectedMonth: parsedEndMonth ?? parsedMonth ?? defaultMonth,
        })}
      </label>

      <h3 class="panel-form__title">觀察紀錄（共 ${parsed.entries.length} 筆，取消勾選可排除不匯入）</h3>
      <ul class="import-preview__entry-list">
        ${parsed.entries.map(entryRow).join('') || '<li>沒有偵測到任何觀察紀錄</li>'}
      </ul>

      <button type="submit" class="btn btn--primary">確認匯入</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-action="cancel"]').addEventListener('click', onCancel);

  container.querySelector('[data-field="period-is-range"]').addEventListener('change', event => {
    container.querySelector('[data-field-group="period-end"]').hidden = !event.target.checked;
  });

  container.querySelector('[data-action="confirm-import"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-error]');

    const name = container.querySelector('[data-field="name"]').value;
    const birthDate = container.querySelector('[data-field="birthDate"]').value;
    const tier = container.querySelector('[data-field="tier"]').value;
    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const startPeriod = `${year}年${month}月`;
    const isRange = container.querySelector('[data-field="period-is-range"]').checked;
    let period = startPeriod;
    if (isRange) {
      const endYear = container.querySelector('[data-field="period-end-year"]').value;
      const endMonth = container.querySelector('[data-field="period-end-month"]').value.padStart(2, '0');
      period = combinedPeriod(startPeriod, `${endYear}年${endMonth}月`);
    }

    const includedEntries = parsed.entries.filter((entry, index) => container.querySelector(`[data-entry-include="${index}"]`).checked);

    try {
      // Match on name+birthDate so re-importing a docx for a child already in the system adds
      // this form to their existing record instead of creating a duplicate child.
      const existingChild = (await listChildren()).find(c => c.name === name && c.birthDate === birthDate);
      const child = existingChild ?? (await addChild({ name, birthDate }));

      // An entry's own indicator code can belong to an earlier tier than the document's overall
      // (majority-vote) tier — the child may not yet have developed into every current-tier
      // indicator — so each entry goes into a form for its own tier rather than being silently
      // dropped by lumping everything under the one selected tier.
      const entriesByTier = new Map();
      for (const entry of includedEntries) {
        const entryTier = entry.tier ?? tier;
        if (!entriesByTier.has(entryTier)) entriesByTier.set(entryTier, []);
        entriesByTier.get(entryTier).push(entry);
      }
      if (entriesByTier.size === 0) entriesByTier.set(tier, []); // still create an empty form to import into

      for (const [entryTier, tierEntries] of entriesByTier) {
        const form = await addForm({ childId: child.id, tier: entryTier, period });
        for (const entry of tierEntries) {
          await addEntry({
            formId: form.id,
            indicatorCode: entry.indicatorCode,
            date: entry.date,
            status: entry.achieved ? 'developed' : 'developing',
            note: entry.note,
          });
        }
      }
      onImported();
    } catch (err) {
      errorEl.textContent = `匯入失敗，請再試一次（${err?.message || err}）`;
    }
  });
}
