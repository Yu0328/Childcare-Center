import { getIndicatorsForTier, getIndicator } from '../data/indicators.js';
import {
  addCoursePlanEntry, listCoursePlanEntriesForReport, deleteCoursePlanEntry, updateCoursePlanEntry,
  addCourseOccurrence, listCourseOccurrencesForEntry, deleteCourseOccurrence, updateCourseOccurrence,
} from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

function statusRadios(id, { namePrefix, fieldAttr, idAttr, checkedStatus }) {
  return `
    <div class="entry-form__radio-group">
      <label class="entry-form__radio">
        <input type="radio" name="${namePrefix}-${escapeHtml(id)}" data-${fieldAttr}="status" data-${idAttr}="${escapeHtml(id)}" value="developed" ${checkedStatus === 'developed' ? 'checked' : ''}> 已發展○
      </label>
      <label class="entry-form__radio">
        <input type="radio" name="${namePrefix}-${escapeHtml(id)}" data-${fieldAttr}="status" data-${idAttr}="${escapeHtml(id)}" value="developing" ${checkedStatus === 'developing' ? 'checked' : ''}> 發展中△
      </label>
    </div>
  `;
}

function occurrenceRow(occurrence) {
  const statusLabel = occurrence.absent ? '請假' : occurrence.status === 'developed' ? '已發展○' : '發展中△';
  return `
    <li class="entry-row${occurrence.absent ? ' entry-row--absent' : ''}" data-course-occurrence="${escapeHtml(occurrence.id)}">
      <div class="entry-row__top">
        <span class="entry-row__date">${escapeHtml(occurrence.date)}　${statusLabel}</span>
        <div class="entry-row__actions">
          <button type="button" class="btn btn--edit btn--small" data-edit-occurrence="${escapeHtml(occurrence.id)}" aria-label="編輯實施紀錄：${escapeHtml(occurrence.date)}">編輯</button>
          <button type="button" class="btn--delete-circle" data-delete-occurrence="${escapeHtml(occurrence.id)}" aria-label="刪除實施紀錄：${escapeHtml(occurrence.date)}">×</button>
        </div>
      </div>
      <p class="entry-row__note">${escapeHtml(occurrence.note)}</p>
      <div class="entry-form" data-occurrence-edit-form-for="${escapeHtml(occurrence.id)}" hidden>
        <label class="entry-form__field">日期 <input type="date" data-occurrence-edit-field="date" data-occurrence-id="${escapeHtml(occurrence.id)}" value="${escapeHtml(occurrence.date)}"></label>
        ${statusRadios(occurrence.id, { namePrefix: 'status-edit', fieldAttr: 'occurrence-edit-field', idAttr: 'occurrence-id', checkedStatus: occurrence.status })}
        <label class="entry-form__checkbox">
          <input type="checkbox" data-occurrence-edit-field="absent" data-occurrence-id="${escapeHtml(occurrence.id)}" ${occurrence.absent ? 'checked' : ''}> 請假／未執行（劃掉日期與說明）
        </label>
        <input type="text" class="entry-form__note" data-occurrence-edit-field="note" data-occurrence-id="${escapeHtml(occurrence.id)}" placeholder="說明" value="${escapeHtml(occurrence.note)}">
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-occurrence-edit-save-for="${escapeHtml(occurrence.id)}">儲存</button>
          <button type="button" class="btn btn--outline btn--small" data-occurrence-edit-cancel-for="${escapeHtml(occurrence.id)}">取消</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
    </li>
  `;
}

function entryCard(entry, indicator, occurrences, tier) {
  return `
    <div class="indicator-block" data-course-entry="${escapeHtml(entry.id)}">
      <h4 class="indicator-block__title">
        <span class="indicator-block__code">${escapeHtml(entry.indicatorCode)}</span>
        【${escapeHtml(entry.activityName)}】${escapeHtml(entry.indicatorText || '')}
        <span class="indicator-block__actions">
          <button type="button" class="btn btn--edit btn--small" data-edit-entry="${escapeHtml(entry.id)}" aria-label="編輯課程計畫項目：${escapeHtml(entry.activityName)}">編輯</button>
          <button type="button" class="btn--delete-circle" data-delete-entry="${escapeHtml(entry.id)}" aria-label="刪除課程計畫項目：${escapeHtml(entry.activityName)}">×</button>
        </span>
      </h4>
      <div class="entry-form" data-entry-edit-form-for="${escapeHtml(entry.id)}" hidden>
        <label class="panel-form__field">
          指標
          <select data-entry-edit-field="indicatorCode" data-entry-id="${escapeHtml(entry.id)}">${indicatorOptionsHtml(tier, entry.indicatorCode)}</select>
        </label>
        <label class="panel-form__field">活動名稱 <input data-entry-edit-field="activityName" data-entry-id="${escapeHtml(entry.id)}" value="${escapeHtml(entry.activityName)}"></label>
        <label class="panel-form__field">能力指標內容 <textarea data-entry-edit-field="indicatorText" data-entry-id="${escapeHtml(entry.id)}" rows="3">${escapeHtml(entry.indicatorText || '')}</textarea></label>
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-entry-edit-save-for="${escapeHtml(entry.id)}">儲存</button>
          <button type="button" class="btn btn--outline btn--small" data-entry-edit-cancel-for="${escapeHtml(entry.id)}">取消</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
      <ul class="entry-list">${occurrences.map(occurrenceRow).join('')}</ul>
      <button type="button" class="btn btn--outline btn--small" data-add-occurrence-for="${escapeHtml(entry.id)}">＋ 新增實施紀錄</button>
      <div class="entry-form" data-occurrence-form-for="${escapeHtml(entry.id)}" hidden>
        <label class="entry-form__field">日期 <input type="date" data-occurrence-field="date" data-entry-id="${escapeHtml(entry.id)}"></label>
        <div class="entry-form__radio-group">
          <label class="entry-form__radio">
            <input type="radio" name="status-${escapeHtml(entry.id)}" data-occurrence-field="status" data-entry-id="${escapeHtml(entry.id)}" value="developed" checked> 已發展○
          </label>
          <label class="entry-form__radio">
            <input type="radio" name="status-${escapeHtml(entry.id)}" data-occurrence-field="status" data-entry-id="${escapeHtml(entry.id)}" value="developing"> 發展中△
          </label>
        </div>
        <label class="entry-form__checkbox">
          <input type="checkbox" data-occurrence-field="absent" data-entry-id="${escapeHtml(entry.id)}"> 請假／未執行（劃掉日期與說明）
        </label>
        <input type="text" class="entry-form__note" data-occurrence-field="note" data-entry-id="${escapeHtml(entry.id)}" placeholder="說明">
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-occurrence-save-for="${escapeHtml(entry.id)}">儲存</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
    </div>
  `;
}

function indicatorOptionsHtml(tier, selectedCode = null) {
  const indicators = getIndicatorsForTier(tier);
  const byDomain = new Map();
  for (const indicator of indicators) {
    if (!byDomain.has(indicator.domainName)) byDomain.set(indicator.domainName, []);
    byDomain.get(indicator.domainName).push(indicator);
  }
  return [...byDomain.entries()]
    .map(
      ([domainName, group]) =>
        `<optgroup label="${escapeHtml(domainName)}">
          ${group.map(i => `<option value="${escapeHtml(i.code)}" ${i.code === selectedCode ? 'selected' : ''}>${escapeHtml(i.code)} ${escapeHtml(i.description)}</option>`).join('')}
        </optgroup>`
    )
    .join('');
}

export async function renderCoursePlanTab(
  container,
  { report, onChange, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const entries = await listCoursePlanEntriesForReport(report.id);
  const occurrencesByEntryId = {};
  for (const entry of entries) {
    occurrencesByEntryId[entry.id] = await listCourseOccurrencesForEntry(entry.id);
  }

  const byDomain = new Map();
  for (const entry of entries) {
    const indicator = getIndicator(entry.indicatorCode);
    const domainName = indicator ? indicator.domainName : '未知領域';
    if (!byDomain.has(domainName)) byDomain.set(domainName, []);
    byDomain.get(domainName).push({ entry, indicator });
  }

  container.innerHTML = `
    <div class="tab-layout">
      <form class="panel-form" data-action="add-entry">
        <h3 class="panel-form__title">新增課程計畫項目</h3>
        <label class="panel-form__field">
          指標
          <select data-field="indicatorCode">${indicatorOptionsHtml(report.tier)}</select>
        </label>
        <label class="panel-form__field">活動名稱 <input data-field="activityName" required></label>
        <label class="panel-form__field">能力指標內容 <textarea data-field="indicatorText" rows="3"></textarea></label>
        <button type="submit" class="btn btn--primary">新增</button>
        <p class="field-error" data-error></p>
      </form>
      <div class="domain-grid">
        ${[...byDomain.entries()]
          .map(
            ([domainName, group]) => `
              <section class="domain-card" data-domain="${escapeHtml(group[0].indicator ? group[0].indicator.domain : '')}">
                <h3 class="domain-card__title">${escapeHtml(domainName)}</h3>
                <div class="domain-card__body">
                  ${group.map(({ entry, indicator }) => entryCard(entry, indicator, occurrencesByEntryId[entry.id] || [], report.tier)).join('')}
                </div>
              </section>
            `
          )
          .join('')}
      </div>
    </div>
  `;

  container.querySelector('[data-action="add-entry"]').addEventListener('submit', async event => {
    event.preventDefault();
    const indicatorCode = container.querySelector('[data-field="indicatorCode"]').value;
    const activityName = container.querySelector('[data-field="activityName"]').value;
    const indicatorText = container.querySelector('[data-field="indicatorText"]').value;
    try {
      await addCoursePlanEntry({ reportId: report.id, indicatorCode, activityName, indicatorText });
      onChange();
    } catch (err) {
      container.querySelector('[data-action="add-entry"] [data-error]').textContent = '新增失敗，請再試一次';
    }
  });

  for (const entry of entries) {
    container.querySelector(`[data-delete-entry="${entry.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${entry.indicatorCode} 【${entry.activityName}】」這個課程計畫項目嗎？此操作無法復原。`)) return;
      try {
        await deleteCoursePlanEntry(entry.id);
        onChange();
      } catch (err) {
        container.querySelector(`[data-course-entry="${entry.id}"]`).appendChild(
          Object.assign(document.createElement('p'), { className: 'field-error', textContent: '刪除失敗，請再試一次' })
        );
      }
    });

    container.querySelector(`[data-edit-entry="${entry.id}"]`).addEventListener('click', () => {
      const form = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
      form.hidden = !form.hidden;
    });

    container.querySelector(`[data-entry-edit-cancel-for="${entry.id}"]`).addEventListener('click', () => {
      container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`).hidden = true;
    });

    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).addEventListener('click', async () => {
      const indicatorCode = container.querySelector(`[data-entry-edit-field="indicatorCode"][data-entry-id="${entry.id}"]`).value;
      const activityName = container.querySelector(`[data-entry-edit-field="activityName"][data-entry-id="${entry.id}"]`).value;
      const indicatorText = container.querySelector(`[data-entry-edit-field="indicatorText"][data-entry-id="${entry.id}"]`).value;
      try {
        await updateCoursePlanEntry(entry.id, { indicatorCode, activityName, indicatorText });
        onChange();
      } catch (err) {
        container.querySelector(`[data-entry-edit-form-for="${entry.id}"] [data-error]`).textContent = '更新失敗，請再試一次';
      }
    });

    container.querySelector(`[data-add-occurrence-for="${entry.id}"]`).addEventListener('click', () => {
      const form = container.querySelector(`[data-occurrence-form-for="${entry.id}"]`);
      form.hidden = !form.hidden;
    });

    container.querySelector(`[data-occurrence-field="absent"][data-entry-id="${entry.id}"]`).addEventListener('change', event => {
      const disabled = event.target.checked;
      container.querySelectorAll(`[data-occurrence-field="status"][data-entry-id="${entry.id}"]`).forEach(radio => {
        radio.disabled = disabled;
      });
    });

    container.querySelector(`[data-occurrence-save-for="${entry.id}"]`).addEventListener('click', async () => {
      const date = container.querySelector(`[data-occurrence-field="date"][data-entry-id="${entry.id}"]`).value;
      const absent = container.querySelector(`[data-occurrence-field="absent"][data-entry-id="${entry.id}"]`).checked;
      const statusInput = container.querySelector(`[data-occurrence-field="status"][data-entry-id="${entry.id}"]:checked`);
      const status = statusInput ? statusInput.value : 'developed';
      const note = container.querySelector(`[data-occurrence-field="note"][data-entry-id="${entry.id}"]`).value;
      try {
        await addCourseOccurrence({ entryId: entry.id, date, status, absent, note });
        onChange();
      } catch (err) {
        container.querySelector(`[data-occurrence-form-for="${entry.id}"] [data-error]`).textContent = '新增失敗，請再試一次';
      }
    });

    for (const occurrence of occurrencesByEntryId[entry.id] || []) {
      container.querySelector(`[data-delete-occurrence="${occurrence.id}"]`).addEventListener('click', async () => {
        if (!confirmDelete(`確定要刪除「${occurrence.date}」這筆實施紀錄嗎？此操作無法復原。`)) return;
        try {
          await deleteCourseOccurrence(occurrence.id);
          onChange();
        } catch (err) {
          // Non-fatal: entry stays visible; the teacher can retry the delete.
        }
      });

      container.querySelector(`[data-edit-occurrence="${occurrence.id}"]`).addEventListener('click', () => {
        const form = container.querySelector(`[data-occurrence-edit-form-for="${occurrence.id}"]`);
        form.hidden = !form.hidden;
      });

      container.querySelector(`[data-occurrence-edit-cancel-for="${occurrence.id}"]`).addEventListener('click', () => {
        container.querySelector(`[data-occurrence-edit-form-for="${occurrence.id}"]`).hidden = true;
      });

      container
        .querySelector(`[data-occurrence-edit-field="absent"][data-occurrence-id="${occurrence.id}"]`)
        .addEventListener('change', event => {
          const disabled = event.target.checked;
          container.querySelectorAll(`[data-occurrence-edit-field="status"][data-occurrence-id="${occurrence.id}"]`).forEach(radio => {
            radio.disabled = disabled;
          });
        });

      container.querySelector(`[data-occurrence-edit-save-for="${occurrence.id}"]`).addEventListener('click', async () => {
        const date = container.querySelector(`[data-occurrence-edit-field="date"][data-occurrence-id="${occurrence.id}"]`).value;
        const absent = container.querySelector(`[data-occurrence-edit-field="absent"][data-occurrence-id="${occurrence.id}"]`).checked;
        const statusInput = container.querySelector(`[data-occurrence-edit-field="status"][data-occurrence-id="${occurrence.id}"]:checked`);
        const status = statusInput ? statusInput.value : 'developed';
        const note = container.querySelector(`[data-occurrence-edit-field="note"][data-occurrence-id="${occurrence.id}"]`).value;
        try {
          await updateCourseOccurrence(occurrence.id, { date, status, absent, note });
          onChange();
        } catch (err) {
          container.querySelector(`[data-occurrence-edit-form-for="${occurrence.id}"] [data-error]`).textContent = '更新失敗，請再試一次';
        }
      });
    }
  }
}
