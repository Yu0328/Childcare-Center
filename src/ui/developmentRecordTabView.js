import { DOMAINS, getIndicator } from '../data/indicators.js';
import {
  listCoursePlanEntriesForReport, listCourseOccurrencesForEntry, addDevelopmentRecordEntry,
  listDevelopmentRecordEntriesForReport, deleteDevelopmentRecordEntry, updateDevelopmentRecordEntry,
} from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

// "Ⅳ-2-4" -> 4 (the item number within its domain) — see courseplanTabView.js's identical helper
// for why: sorts the reference checkboxes in the indicator picker's own order regardless of the
// order entries were added in (insertion/id order otherwise, unrelated to indicator numbering).
function indicatorItemNumber(code) {
  const match = /-(\d+)$/.exec(String(code ?? ''));
  return match ? Number(match[1]) : Infinity;
}

// A reference checkbox reflects the 課程計畫表 entry it's tied to: if ANY of its occurrences was
// 請假 or 更換課程, the checkbox reads struck-through and red (courseChanged wins if somehow both
// occur across different dates, matching aggregateCoursePlan.js's own absent/courseChanged
// precedent); a 發展中-only entry reads red without the strikethrough. This is scoped to the
// checkbox picker only — the saved record's own referenced-indicator display (existingRecordCard's
// entry-list) and the Word export are untouched by design.
function checkboxFlagClass(occurrences) {
  if (occurrences.some(o => o.courseChanged)) return ' panel-form__checkbox-row--flag panel-form__checkbox-row--course-changed';
  if (occurrences.some(o => o.absent)) return ' panel-form__checkbox-row--flag panel-form__checkbox-row--absent';
  if (occurrences.some(o => o.status === 'developing')) return ' panel-form__checkbox-row--flag';
  return '';
}

function checkboxListHtml(entries, { checkboxAttr, checkedIds = [], recordId = null, occurrencesByEntryId = {} }) {
  if (entries.length === 0) return '<p>這個領域尚未在課程計畫表填寫任何項目</p>';
  return entries
    .map(
      entry => `
      <label class="panel-form__checkbox-row${checkboxFlagClass(occurrencesByEntryId[entry.id] || [])}">
        <input type="checkbox" data-${checkboxAttr}="${escapeHtml(entry.id)}" ${recordId !== null ? `data-record-id="${escapeHtml(recordId)}"` : ''} ${checkedIds.includes(entry.id) ? 'checked' : ''}>
        ${escapeHtml(entry.indicatorCode)} 【${escapeHtml(entry.activityName)}】${escapeHtml(entry.indicatorText || '')}
      </label>
    `
    )
    .join('');
}

function recordLabel(record) {
  const narrative = record.narrative || '';
  return narrative.length > 12 ? `${narrative.slice(0, 12)}…` : narrative;
}

function existingRecordCard(record, coursePlanEntriesById, { isEditing, editDomainEntries, editDomainValue, occurrencesByEntryId }) {
  const lines = record.courseEntryIds
    .map(id => coursePlanEntriesById.get(id))
    .filter(Boolean)
    .map(entry => {
      const indicator = getIndicator(entry.indicatorCode);
      return `<li>${escapeHtml(entry.indicatorCode)}　${escapeHtml(indicator ? indicator.description : '')}</li>`;
    })
    .join('');

  const editFormHtml = `
    <div class="entry-form" data-record-edit-form-for="${escapeHtml(record.id)}" ${isEditing ? '' : 'hidden'}>
      <label class="panel-form__field">
        領域
        <select data-record-edit-field="domain" data-record-id="${escapeHtml(record.id)}">
          ${DOMAINS.map(d => `<option value="${d.id}" ${d.id === editDomainValue ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
        </select>
      </label>
      <fieldset class="panel-form__field">
        <legend>已在課程計畫表填寫的項目（勾選要引用的項目）</legend>
        ${checkboxListHtml(editDomainEntries, { checkboxAttr: 'record-edit-entry-checkbox', checkedIds: record.courseEntryIds, recordId: record.id, occurrencesByEntryId })}
      </fieldset>
      <label class="panel-form__field">敘述 <textarea data-record-edit-field="narrative" data-record-id="${escapeHtml(record.id)}">${escapeHtml(record.narrative)}</textarea></label>
      <div class="entry-form__actions">
        <button type="button" class="btn btn--primary btn--small" data-record-edit-save-for="${escapeHtml(record.id)}">儲存</button>
        <button type="button" class="btn btn--outline btn--small" data-record-edit-cancel-for="${escapeHtml(record.id)}">取消</button>
      </div>
      <p class="field-error" data-error></p>
    </div>
  `;

  return `
    <div class="indicator-block" data-development-record="${escapeHtml(record.id)}">
      <ul class="entry-list">${lines}</ul>
      <p class="entry-row__note">${escapeHtml(record.narrative)}</p>
      <span class="indicator-block__actions">
        <button type="button" class="btn btn--edit btn--small" data-edit-record="${escapeHtml(record.id)}" aria-label="編輯適性發展紀錄段落：${escapeHtml(recordLabel(record))}">編輯</button>
        <button type="button" class="btn--delete-circle" data-delete-record="${escapeHtml(record.id)}" aria-label="刪除適性發展紀錄段落：${escapeHtml(recordLabel(record))}">×</button>
      </span>
      ${editFormHtml}
    </div>
  `;
}

export async function renderDevelopmentRecordTab(
  container,
  {
    report, onChange, selectedDomain = DOMAINS[0].id, editingRecordId = null, editDomain = null,
    confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false),
  }
) {
  const allEntries = await listCoursePlanEntriesForReport(report.id);
  const records = await listDevelopmentRecordEntriesForReport(report.id);
  const coursePlanEntriesById = new Map(allEntries.map(e => [e.id, e]));

  // Feeds checkboxFlagClass so the reference checkboxes below can flag 請假/更換課程/發展中 —
  // fetched once per entry here (not inside checkboxListHtml) since both the add-record panel and
  // every existing record's edit form share the same entries/occurrences for this report.
  const occurrencesByEntryId = {};
  for (const entry of allEntries) {
    occurrencesByEntryId[entry.id] = await listCourseOccurrencesForEntry(entry.id);
  }

  const byDomain = new Map();
  for (const record of records) {
    if (!byDomain.has(record.domain)) byDomain.set(record.domain, []);
    byDomain.get(record.domain).push(record);
  }

  const entriesByDomainNumber = domainNumber =>
    allEntries
      .filter(entry => {
        const indicator = getIndicator(entry.indicatorCode);
        return indicator && indicator.domain === Number(domainNumber);
      })
      .sort((a, b) => indicatorItemNumber(a.indicatorCode) - indicatorItemNumber(b.indicatorCode));

  const domainEntries = entriesByDomainNumber(selectedDomain);

  // See courseplanTabView.js's identical block for why reading the container's existing
  // <details> state (before overwriting it) is what lets collapse/expand survive re-renders.
  const previousDomainCards = [...container.querySelectorAll('.domain-card')];
  const previousOpenDomains = new Set(previousDomainCards.filter(el => el.open).map(el => el.dataset.domain));
  const hadPreviousRender = previousDomainCards.length > 0;

  container.innerHTML = `
    <div class="tab-layout">
      <form class="panel-form panel-form--wide" data-action="add-record">
        <h3 class="panel-form__title">新增段落</h3>
        <label class="panel-form__field">
          領域
          <select data-field="domain">
            ${DOMAINS.map(d => `<option value="${d.id}" ${d.id === Number(selectedDomain) ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </label>
        <fieldset class="panel-form__field">
          <legend>已在課程計畫表填寫的項目（勾選要引用的項目）</legend>
          <div class="panel-form__checkbox-grid">${checkboxListHtml(domainEntries, { checkboxAttr: 'course-entry-checkbox', occurrencesByEntryId })}</div>
        </fieldset>
        <label class="panel-form__field">敘述 <textarea data-field="narrative" required></textarea></label>
        <button type="submit" class="btn btn--primary">新增</button>
        <p class="field-error" data-error></p>
      </form>
      <div class="domain-grid domain-grid--single">
        ${DOMAINS.filter(d => byDomain.has(d.id))
          .map((domain, index) => {
            const isOpen = hadPreviousRender ? previousOpenDomains.has(String(domain.id)) : index === 0;
            return `
              <details class="domain-card" data-domain="${domain.id}" ${isOpen ? 'open' : ''}>
                <summary class="domain-card__title">${escapeHtml(domain.name)}</summary>
                <div class="domain-card__body">
                  ${byDomain
                    .get(domain.id)
                    .map(record => {
                      const isEditing = record.id === editingRecordId;
                      const domainValue = isEditing && editDomain !== null ? editDomain : record.domain;
                      return existingRecordCard(record, coursePlanEntriesById, {
                        isEditing,
                        editDomainEntries: entriesByDomainNumber(domainValue),
                        editDomainValue: domainValue,
                        occurrencesByEntryId,
                      });
                    })
                    .join('')}
                </div>
              </details>
            `;
          })
          .join('')}
      </div>
    </div>
  `;

  container.querySelector('[data-field="domain"]').addEventListener('change', event => {
    renderDevelopmentRecordTab(container, {
      report, onChange, selectedDomain: Number(event.target.value), editingRecordId, editDomain, confirmDelete,
    });
  });

  container.querySelector('[data-action="add-record"]').addEventListener('submit', async event => {
    event.preventDefault();
    const domain = Number(container.querySelector('[data-field="domain"]').value);
    const narrative = container.querySelector('[data-field="narrative"]').value;
    const courseEntryIds = domainEntries
      .filter(entry => container.querySelector(`[data-course-entry-checkbox="${entry.id}"]`).checked)
      .map(entry => entry.id);
    try {
      await addDevelopmentRecordEntry({ reportId: report.id, domain, courseEntryIds, narrative });
      onChange();
    } catch (err) {
      container.querySelector('[data-action="add-record"] [data-error]').textContent = '新增失敗，請再試一次';
    }
  });

  for (const record of records) {
    container.querySelector(`[data-delete-record="${record.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${recordLabel(record)}」這段適性發展紀錄嗎？此操作無法復原。`)) return;
      try {
        await deleteDevelopmentRecordEntry(record.id);
        onChange();
      } catch (err) {
        // Non-fatal: entry stays visible; the teacher can retry the delete.
      }
    });

    container.querySelector(`[data-edit-record="${record.id}"]`).addEventListener('click', () => {
      renderDevelopmentRecordTab(container, {
        report,
        onChange,
        selectedDomain,
        editingRecordId: editingRecordId === record.id ? null : record.id,
        editDomain: null,
        confirmDelete,
      });
    });

    if (record.id === editingRecordId) {
      const currentEditDomain = editDomain !== null ? editDomain : record.domain;
      const editEntries = entriesByDomainNumber(currentEditDomain);

      container.querySelector(`[data-record-edit-field="domain"][data-record-id="${record.id}"]`).addEventListener('change', event => {
        renderDevelopmentRecordTab(container, {
          report,
          onChange,
          selectedDomain,
          editingRecordId,
          editDomain: Number(event.target.value),
          confirmDelete,
        });
      });

      container.querySelector(`[data-record-edit-cancel-for="${record.id}"]`).addEventListener('click', () => {
        renderDevelopmentRecordTab(container, { report, onChange, selectedDomain, editingRecordId: null, confirmDelete });
      });

      container.querySelector(`[data-record-edit-save-for="${record.id}"]`).addEventListener('click', async () => {
        const domain = Number(container.querySelector(`[data-record-edit-field="domain"][data-record-id="${record.id}"]`).value);
        const narrative = container.querySelector(`[data-record-edit-field="narrative"][data-record-id="${record.id}"]`).value;
        const courseEntryIds = editEntries
          .filter(entry => container.querySelector(`[data-record-edit-entry-checkbox="${entry.id}"][data-record-id="${record.id}"]`).checked)
          .map(entry => entry.id);
        try {
          await updateDevelopmentRecordEntry(record.id, { domain, courseEntryIds, narrative });
          onChange();
        } catch (err) {
          container.querySelector(`[data-record-edit-form-for="${record.id}"] [data-error]`).textContent = '更新失敗，請再試一次';
        }
      });
    }
  }
}
