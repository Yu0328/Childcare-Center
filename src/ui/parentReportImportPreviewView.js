import { addChild, listChildren } from '../storage/db.js';
import {
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  addDevelopmentRecordEntry, addBehaviorObservation, addHighlightEntry,
} from '../storage/parentReportDb.js';
import { DOMAINS, TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml, parsePeriod } from './periodFields.js';

function coursePlanEntryRow(entry, index) {
  const occurrenceSummary = entry.occurrences.map(o => `${escapeHtml(o.date)}${o.absent ? '（請假）' : o.status === 'developed' ? '○' : '△'}`).join('、');
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-course-entry-include="${index}" checked>
        <span class="import-preview__entry-code">${escapeHtml(entry.indicatorCode)}</span>
        【${escapeHtml(entry.activityName)}】— ${occurrenceSummary || '（無實施紀錄）'}
      </label>
    </li>
  `;
}

function developmentRecordRow(block, index) {
  const domainName = DOMAINS.find(d => d.id === block.domain)?.name ?? '';
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-record-include="${index}" checked>
        <strong>${escapeHtml(domainName)}</strong>：${escapeHtml(block.narrative)}
      </label>
    </li>
  `;
}

function behaviorObservationRow(observation, index) {
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-observation-include="${index}" checked>
        ${escapeHtml(observation.title)}：${escapeHtml(observation.narrative)}
      </label>
    </li>
  `;
}

function highlightRow(entry, index) {
  const thumbs = entry.photos.map(blob => `<img class="highlight-thumb" src="${URL.createObjectURL(blob)}" alt="">`).join('');
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-highlight-include="${index}" checked>
        <div class="highlight-thumbs">${thumbs}</div>
        ${escapeHtml(entry.caption)}
      </label>
    </li>
  `;
}

export function renderParentReportImportPreviewView(container, { parsed, onCancel, onImported }) {
  const defaultRocYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;
  const { year: parsedYear, month: parsedMonth } = parsePeriod(parsed.period);

  container.innerHTML = `
    <div class="page-header">
      <button type="button" class="btn btn--ghost" data-action="cancel">← 取消匯入</button>
      <h2 class="page-header__title">確認匯入內容（適性紀錄）</h2>
    </div>
    ${
      parsed.warnings.length > 0
        ? `<ul class="import-preview__warnings">${parsed.warnings.map(w => `<li class="field-error">${escapeHtml(w)}</li>`).join('')}</ul>`
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
        ${periodSelectsHtml({ yearFieldName: 'period-year', monthFieldName: 'period-month', selectedYear: parsedYear ?? defaultRocYear, selectedMonth: parsedMonth ?? defaultMonth })}
      </label>

      <h3 class="panel-form__title">課程計畫表（共 ${parsed.coursePlanEntries.length} 項）</h3>
      <ul class="import-preview__entry-list">${parsed.coursePlanEntries.map(coursePlanEntryRow).join('') || '<li>沒有偵測到任何項目</li>'}</ul>

      <h3 class="panel-form__title">適性發展紀錄表（共 ${parsed.developmentRecordBlocks.length} 段）</h3>
      <ul class="import-preview__entry-list">${parsed.developmentRecordBlocks.map(developmentRecordRow).join('') || '<li>沒有偵測到任何段落</li>'}</ul>

      <h3 class="panel-form__title">行為觀察（共 ${parsed.behaviorObservations.length} 筆）</h3>
      <ul class="import-preview__entry-list">${parsed.behaviorObservations.map(behaviorObservationRow).join('') || '<li>沒有偵測到任何觀察</li>'}</ul>

      <h3 class="panel-form__title">點滴分享（共 ${parsed.highlightEntries.length} 組）</h3>
      <ul class="import-preview__entry-list">${parsed.highlightEntries.map(highlightRow).join('') || '<li>沒有偵測到任何照片</li>'}</ul>

      <button type="submit" class="btn btn--primary">確認匯入</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-action="cancel"]').addEventListener('click', onCancel);

  container.querySelector('[data-action="confirm-import"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-error]');

    const name = container.querySelector('[data-field="name"]').value;
    const birthDate = container.querySelector('[data-field="birthDate"]').value;
    const tier = container.querySelector('[data-field="tier"]').value;
    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;

    const includedEntryIndexes = parsed.coursePlanEntries
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-course-entry-include="${i}"]`).checked);
    const includedRecordIndexes = parsed.developmentRecordBlocks
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-record-include="${i}"]`).checked);
    const includedObservationIndexes = parsed.behaviorObservations
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-observation-include="${i}"]`).checked);
    const includedHighlightIndexes = parsed.highlightEntries
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-highlight-include="${i}"]`).checked);

    try {
      // Match on name+birthDate so re-importing a docx for a child already in the system adds
      // this report to their existing record instead of creating a duplicate child.
      const existingChild = (await listChildren()).find(c => c.name === name && c.birthDate === birthDate);
      const child = existingChild ?? (await addChild({ name, birthDate }));
      const report = await addParentReport({ childId: child.id, tier, period });

      const entryIdByOriginalIndex = new Map();
      for (const index of includedEntryIndexes) {
        const source = parsed.coursePlanEntries[index];
        const created = await addCoursePlanEntry({ reportId: report.id, indicatorCode: source.indicatorCode, activityName: source.activityName, indicatorText: source.indicatorText });
        entryIdByOriginalIndex.set(index, created.id);
        for (const occurrence of source.occurrences) {
          await addCourseOccurrence({ entryId: created.id, ...occurrence });
        }
      }

      for (const index of includedRecordIndexes) {
        const source = parsed.developmentRecordBlocks[index];
        const courseEntryIds = source.courseEntryIndexes
          .filter(i => entryIdByOriginalIndex.has(i))
          .map(i => entryIdByOriginalIndex.get(i));
        await addDevelopmentRecordEntry({ reportId: report.id, domain: source.domain, courseEntryIds, narrative: source.narrative });
      }

      for (const index of includedObservationIndexes) {
        const source = parsed.behaviorObservations[index];
        await addBehaviorObservation({ reportId: report.id, title: source.title, narrative: source.narrative });
      }

      for (const index of includedHighlightIndexes) {
        const source = parsed.highlightEntries[index];
        const photos = source.photos.map(blob => ({ blob, width: 0, height: 0 })); // dimensions unknown for legacy photos — see parentReportDocxExport.js's highlightPhotoCell guard
        await addHighlightEntry({ reportId: report.id, photos, caption: source.caption });
      }

      onImported();
    } catch (err) {
      errorEl.textContent = '匯入失敗，請再試一次';
    }
  });
}
