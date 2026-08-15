import { getIndicatorsForTier, tierFormLabel, previousTier, getIndicator } from '../data/indicators.js';
import { addEntry, deleteEntry, listEntriesForForm, listFormsForChild, updateEntry } from '../storage/db.js';
import { generateDocxBlob, downloadDocx } from '../export/docxExport.js';
import { escapeHtml } from './escapeHtml.js';

function statusRadios(id, { fieldAttr, idAttr, checkedStatus }) {
  return `
    <div class="entry-form__radio-group">
      <label class="entry-form__radio">
        <input type="radio" name="status-${escapeHtml(id)}" data-${fieldAttr}="status" data-${idAttr}="${escapeHtml(id)}" value="developed" ${checkedStatus === 'developed' ? 'checked' : ''}> 已發展○
      </label>
      <label class="entry-form__radio">
        <input type="radio" name="status-${escapeHtml(id)}" data-${fieldAttr}="status" data-${idAttr}="${escapeHtml(id)}" value="developing" ${checkedStatus === 'developing' ? 'checked' : ''}> 發展中△
      </label>
    </div>
  `;
}

function entryRow(entry) {
  const mark = entry.status === 'developed' ? '○' : '△';
  return `
    <li class="entry-row${entry.status === 'developed' ? ' entry-row--achieved' : ''}" data-entry="${escapeHtml(entry.id)}">
      <div class="entry-row__top">
        <span class="entry-row__date"><span class="entry-row__mark">${mark}</span>${escapeHtml(entry.date)}</span>
        <div class="entry-row__actions">
          <button type="button" class="btn btn--edit btn--small" data-edit-entry="${escapeHtml(entry.id)}" aria-label="編輯觀察紀錄：${escapeHtml(entry.indicatorCode)} ${escapeHtml(entry.date)}">編輯</button>
          <button type="button" class="btn--delete-circle" data-delete-entry="${escapeHtml(entry.id)}" aria-label="刪除觀察紀錄：${escapeHtml(entry.indicatorCode)} ${escapeHtml(entry.date)}">×</button>
        </div>
      </div>
      <p class="entry-row__note">${escapeHtml(entry.note)}</p>
      <div class="entry-form" data-entry-edit-form-for="${escapeHtml(entry.id)}" hidden>
        <label class="entry-form__field">日期 <input type="date" data-entry-edit-field="date" data-entry-id="${escapeHtml(entry.id)}" value="${escapeHtml(entry.date)}"></label>
        ${statusRadios(entry.id, { fieldAttr: 'entry-edit-field', idAttr: 'entry-id', checkedStatus: entry.status })}
        <input type="text" class="entry-form__note" data-entry-edit-field="note" data-entry-id="${escapeHtml(entry.id)}" placeholder="觀察敘述" value="${escapeHtml(entry.note)}">
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-entry-edit-save-for="${escapeHtml(entry.id)}">儲存</button>
          <button type="button" class="btn btn--outline btn--small" data-entry-edit-cancel-for="${escapeHtml(entry.id)}">取消</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
    </li>
  `;
}

function indicatorBlock(indicator, entries) {
  return `
    <div class="indicator-block" data-indicator-code="${escapeHtml(indicator.code)}">
      <h4 class="indicator-block__title"><span class="indicator-block__code">${escapeHtml(indicator.code)}</span>${escapeHtml(indicator.description)}</h4>
      <ul class="entry-list">${entries.map(entryRow).join('')}</ul>
      <button type="button" class="btn btn--outline btn--small" data-add-entry-for="${escapeHtml(indicator.code)}">＋ 新增觀察紀錄</button>
      <div class="entry-form" data-entry-form-for="${escapeHtml(indicator.code)}" hidden>
        <label class="entry-form__field">日期 <input type="date" data-entry-field="date" data-indicator-code="${escapeHtml(indicator.code)}"></label>
        ${statusRadios(indicator.code, { fieldAttr: 'entry-field', idAttr: 'indicator-code', checkedStatus: 'developed' })}
        <input type="text" class="entry-form__note" data-entry-field="note" data-indicator-code="${escapeHtml(indicator.code)}" placeholder="觀察敘述">
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-entry-save-for="${escapeHtml(indicator.code)}">儲存</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
    </div>
  `;
}

// isLocal: this entry lives on THIS form (an unresolved-code entry left here by 彙整, or one the
// teacher added directly below) — deletable from here. A previous-tier entry lives on a different
// form instead; edit/delete it there, not here. getIndicator returns undefined for an unresolved
// code, leaving the description blank below (activityName isn't shown here — the code/date/note
// are what matter on screen; the Word export's own fallback is what actually needed it).
function remarkBlock(entry) {
  const indicator = getIndicator(entry.indicatorCode);
  const mark = entry.status === 'developed' ? '○' : '△';
  return `
    <div class="indicator-block" data-indicator-code="${escapeHtml(entry.indicatorCode)}">
      <div class="entry-row__top">
        <h4 class="indicator-block__title"><span class="indicator-block__code">${escapeHtml(entry.indicatorCode)}</span>${escapeHtml(indicator?.description ?? '')}</h4>
        ${
          entry.isLocal
            ? `<button type="button" class="btn--delete-circle" data-delete-remark="${escapeHtml(entry.id)}" aria-label="刪除備註：${escapeHtml(entry.indicatorCode)} ${escapeHtml(entry.date)}">×</button>`
            : ''
        }
      </div>
      <p class="entry-row__date"><span class="entry-row__mark">${mark}</span>${escapeHtml(entry.date)}</p>
      <p class="entry-row__note">${escapeHtml(entry.note)}</p>
    </div>
  `;
}

// This child's still-developing (未完成) entries recorded against their previous tier's
// indicators — a child moving up a tier can still have open items from before, and they'd
// otherwise never show up on any form again once the new tier's form takes over.
async function previousTierDevelopingEntries(childId, tier) {
  const prevTier = previousTier(tier);
  if (!prevTier) return [];
  const forms = (await listFormsForChild(childId)).filter(f => f.tier === prevTier);
  const entriesPerForm = await Promise.all(forms.map(f => listEntriesForForm(f.id)));
  return entriesPerForm.flat().filter(entry => entry.status === 'developing');
}

// Every remark source combined: this child's still-developing entries from their previous tier's
// form (isLocal: false — edit/delete those at the source), plus any of THIS form's own entries
// whose indicator code doesn't match one of this tier's own indicators at all (isLocal: true) —
// either because 彙整 filed an unresolvable one here as-is (see aggregateCoursePlan.js), or
// because the teacher added it directly via the 備註 section's own "＋ 新增備註" form.
async function remarkEntries(childId, tier, ownEntries, ownIndicatorCodes) {
  const previousTierEntries = (await previousTierDevelopingEntries(childId, tier)).map(entry => ({ ...entry, isLocal: false }));
  const ownOrphaned = ownEntries
    .filter(entry => !ownIndicatorCodes.has(entry.indicatorCode))
    .map(entry => ({ ...entry, isLocal: true }));
  return [...previousTierEntries, ...ownOrphaned];
}

export async function renderFormEditorView(
  container,
  { child, form, onBack, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const indicators = getIndicatorsForTier(form.tier);
  const entries = await listEntriesForForm(form.id);
  const ownIndicatorCodes = new Set(indicators.map(i => i.code));
  const ownEntries = entries.filter(entry => ownIndicatorCodes.has(entry.indicatorCode));

  const entriesByIndicatorCode = {};
  for (const entry of ownEntries) {
    (entriesByIndicatorCode[entry.indicatorCode] ??= []).push(entry);
  }

  const domains = [...new Map(indicators.map(i => [i.domainName, i.domain])).entries()];
  const remarks = await remarkEntries(child.id, form.tier, entries, ownIndicatorCodes);

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回適性總表列表</button>
      <h2 class="page-header__title">${escapeHtml(child.name)}　${escapeHtml(form.tier)} 階段　${escapeHtml(form.period)}</h2>
      <button type="button" class="btn btn--primary" data-action="export">匯出 Word</button>
    </div>
    <p class="field-error field-error--center" data-error="export"></p>
    <div class="domain-grid domain-grid--row">
      ${domains
        .map(
          ([domainName, domainId]) => `
            <section class="domain-card" data-domain="${domainId}">
              <h3 class="domain-card__title">${escapeHtml(domainName)}</h3>
              <div class="domain-card__body">
                ${indicators
                  .filter(i => i.domainName === domainName)
                  .map(indicator => indicatorBlock(indicator, entriesByIndicatorCode[indicator.code] || []))
                  .join('')}
              </div>
            </section>
          `
        )
        .join('')}
      <section class="domain-card" data-remark-section>
        <h3 class="domain-card__title">備註</h3>
        <div class="domain-card__body">
          ${remarks.map(remarkBlock).join('')}
          <button type="button" class="btn btn--outline btn--small" data-action="add-remark">＋ 新增備註</button>
          <div class="entry-form" data-remark-form hidden>
            <label class="entry-form__field">標籤 <input type="text" data-remark-field="code" placeholder="例：Ⅳ-5-4 或自訂文字"></label>
            <label class="entry-form__field">日期 <input type="date" data-remark-field="date"></label>
            ${statusRadios('remark', { fieldAttr: 'remark-field', idAttr: 'remark-id', checkedStatus: 'developed' })}
            <input type="text" class="entry-form__note" data-remark-field="note" placeholder="備註內容">
            <div class="entry-form__actions">
              <button type="button" class="btn btn--primary btn--small" data-action="save-remark">儲存</button>
            </div>
            <p class="field-error" data-error></p>
          </div>
        </div>
      </section>
    </div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  container.querySelector('[data-action="export"]').addEventListener('click', async () => {
    const errorEl = container.querySelector('[data-error="export"]');
    try {
      const freshEntries = await listEntriesForForm(form.id);
      const blob = await generateDocxBlob({
        child, form, indicators,
        entries: freshEntries,
        previousTierEntries: await remarkEntries(child.id, form.tier, freshEntries, ownIndicatorCodes),
      });
      downloadDocx(blob, `${child.name}-${tierFormLabel(form.tier)}-${form.period}.docx`);
      if (errorEl) errorEl.textContent = '';
    } catch (err) {
      if (errorEl) errorEl.textContent = `匯出失敗，請再試一次（${err?.message || err}）`;
    }
  });

  container.querySelector('[data-action="add-remark"]').addEventListener('click', () => {
    const remarkForm = container.querySelector('[data-remark-form]');
    remarkForm.hidden = !remarkForm.hidden;
  });

  container.querySelector('[data-action="save-remark"]').addEventListener('click', async () => {
    const errorEl = container.querySelector('[data-remark-form] [data-error]');
    const code = container.querySelector('[data-remark-field="code"]').value;
    const date = container.querySelector('[data-remark-field="date"]').value;
    const radios = container.querySelectorAll('input[name="status-remark"]');
    const statusInput = Array.from(radios).find(r => r.checked);
    const status = statusInput ? statusInput.value : 'developed';
    const note = container.querySelector('[data-remark-field="note"]').value;
    try {
      await addEntry({ formId: form.id, indicatorCode: code, date, status, note });
      await renderFormEditorView(container, { child, form, onBack, confirmDelete });
    } catch (err) {
      if (errorEl) errorEl.textContent = '新增失敗，請再試一次';
    }
  });

  for (const entry of remarks.filter(r => r.isLocal)) {
    container.querySelector(`[data-delete-remark="${entry.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除這筆備註嗎？此操作無法復原。`)) return;
      try {
        await deleteEntry(entry.id);
        await renderFormEditorView(container, { child, form, onBack, confirmDelete });
      } catch (err) {
        const errorEl = container.querySelector('[data-remark-form] [data-error]');
        if (errorEl) errorEl.textContent = '刪除失敗，請再試一次';
      }
    });
  }

  for (const indicator of indicators) {
    container.querySelector(`[data-add-entry-for="${indicator.code}"]`).addEventListener('click', () => {
      const entryForm = container.querySelector(`[data-entry-form-for="${indicator.code}"]`);
      entryForm.hidden = !entryForm.hidden;
    });

    container.querySelector(`[data-entry-save-for="${indicator.code}"]`).addEventListener('click', async () => {
      const date = container.querySelector(`[data-entry-field="date"][data-indicator-code="${indicator.code}"]`).value;
      const radios = container.querySelectorAll(`input[name="status-${escapeHtml(indicator.code)}"]`);
      const statusInput = Array.from(radios).find(r => r.checked);
      const status = statusInput ? statusInput.value : 'developed';
      const note = container.querySelector(`[data-entry-field="note"][data-indicator-code="${indicator.code}"]`).value;
      try {
        await addEntry({ formId: form.id, indicatorCode: indicator.code, date, status, note });
        await renderFormEditorView(container, { child, form, onBack, confirmDelete });
      } catch (err) {
        const entryForm = container.querySelector(`[data-entry-form-for="${indicator.code}"]`);
        const errorEl = entryForm.querySelector('[data-error]');
        if (errorEl) errorEl.textContent = '新增失敗，請再試一次';
      }
    });
  }

  // Only this tier's own entries got an indicator block rendered above — a remark (previous-tier,
  // or an unresolved-code entry left on this form by 彙整) has no delete/edit buttons to wire.
  for (const entry of ownEntries) {
    container.querySelector(`[data-delete-entry="${entry.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${entry.indicatorCode} ${entry.date}」這筆觀察紀錄嗎？此操作無法復原。`)) return;
      try {
        await deleteEntry(entry.id);
        await renderFormEditorView(container, { child, form, onBack, confirmDelete });
      } catch (err) {
        const indicatorBlockEl = container.querySelector(`[data-indicator-code="${entry.indicatorCode}"]`);
        let errorEl = indicatorBlockEl.querySelector('[data-error="delete"]');
        if (!errorEl) {
          errorEl = document.createElement('p');
          errorEl.dataset.error = 'delete';
          errorEl.className = 'field-error';
          indicatorBlockEl.appendChild(errorEl);
        }
        errorEl.textContent = '刪除失敗，請再試一次';
      }
    });

    container.querySelector(`[data-edit-entry="${entry.id}"]`).addEventListener('click', () => {
      const editForm = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
      editForm.hidden = !editForm.hidden;
    });

    container.querySelector(`[data-entry-edit-cancel-for="${entry.id}"]`).addEventListener('click', () => {
      container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`).hidden = true;
    });

    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).addEventListener('click', async () => {
      const date = container.querySelector(`[data-entry-edit-field="date"][data-entry-id="${entry.id}"]`).value;
      const radios = container.querySelectorAll(`input[name="status-${escapeHtml(entry.id)}"]`);
      const statusInput = Array.from(radios).find(r => r.checked);
      const status = statusInput ? statusInput.value : 'developed';
      const note = container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value;
      try {
        await updateEntry(entry.id, { date, status, note });
        await renderFormEditorView(container, { child, form, onBack, confirmDelete });
      } catch (err) {
        const errorEl = container.querySelector(`[data-entry-edit-form-for="${entry.id}"] [data-error]`);
        if (errorEl) errorEl.textContent = '更新失敗，請再試一次';
      }
    });
  }
}
