import { addChild, listChildren, deleteChild } from '../storage/db.js';
import { escapeHtml } from './escapeHtml.js';
import { parseDocxImport } from '../import/docxImport.js';
import { renderImportPreviewView } from './importPreviewView.js';
import { parseParentReportDocxImport } from '../import/parentReportDocxImport.js';
import { renderParentReportImportPreviewView } from './parentReportImportPreviewView.js';
import { birthDateSelectsHtml, wireBirthDateSelects, parseBirthDateSelects } from './birthDateField.js';

// Processes a multi-file selection one at a time: parses the next file, shows its existing
// single-file preview/confirm screen, and — whether the user confirms or cancels that one — moves
// on to the next file in the queue, rather than dropping back to the child list until every
// selected file has had its own turn. A file that fails to parse is skipped (not aborting the rest
// of the batch); every skipped filename is reported together in one summary once the whole queue
// finishes, since the preview screens that follow would otherwise overwrite a per-file error
// before the person ever saw it.
async function processImportQueue(files, { parseFn, renderPreview, container, backToList }) {
  const queue = Array.from(files);
  const skipped = [];

  async function next(index) {
    if (index >= queue.length) {
      await backToList();
      if (skipped.length > 0) {
        const importErrorEl = container.querySelector('[data-error="import"]');
        if (importErrorEl) importErrorEl.textContent = `以下檔案無法讀取，已略過：${skipped.join('、')}`;
      }
      return;
    }

    const file = queue[index];
    let parsed;
    try {
      parsed = await parseFn(file);
    } catch (err) {
      skipped.push(file.name);
      await next(index + 1);
      return;
    }

    renderPreview(container, {
      parsed,
      onCancel: () => next(index + 1),
      onImported: () => next(index + 1),
    });
  }

  await next(0);
}

export async function renderChildListView(
  container,
  { onSelectChild, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false), onBack, reportType }
) {
  const children = await listChildren();
  const isParentReport = reportType === 'parent-report';

  container.innerHTML = `
    <div class="page-header page-header--editor">
      ${onBack ? '<button type="button" class="btn btn--ghost" data-action="back">← 返回選擇表單</button>' : ''}
      <h2 class="page-header__title">幼兒列表</h2>
      ${
        isParentReport
          ? `<button type="button" class="btn btn--purple" data-action="import-parent-report-docx">適性紀錄匯入</button>
             <input type="file" accept=".docx" data-field="import-parent-report-file" multiple hidden>`
          : `<button type="button" class="btn btn--purple" data-action="import-docx">適性總表匯入</button>
             <input type="file" accept=".docx" data-field="import-file" multiple hidden>`
      }
    </div>
    <p class="field-error field-error--center" data-error="import"></p>
    <div class="tab-layout">
      <div class="entry-list-wrap">
        <ul class="card-list">
          ${children
            .map(
              child =>
                `<li class="card-list__row">
                  <button type="button" class="card-list__item" data-child-id="${escapeHtml(child.id)}">
                    <span class="card-list__name">${escapeHtml(child.name)}</span>
                    <span class="card-list__meta">出生日期：${escapeHtml(child.birthDate)}</span>
                  </button>
                  <button type="button" class="card-list__delete" data-delete-child="${escapeHtml(child.id)}" aria-label="刪除${escapeHtml(child.name)}">×</button>
                </li>`
            )
            .join('') || '<li class="card-list__empty">目前還沒有幼兒資料，請在右側「新增幼兒」新增</li>'}
        </ul>
        <p class="field-error" data-error="delete"></p>
      </div>
      <form class="panel-form" data-action="add-child">
        <h3 class="panel-form__title">新增幼兒</h3>
        <label class="panel-form__field">姓名 <input data-field="name" required></label>
        <label class="panel-form__field">
          出生日期
          ${birthDateSelectsHtml({ yearFieldName: 'birthDate-year', monthFieldName: 'birthDate-month', dayFieldName: 'birthDate-day' })}
        </label>
        <button type="submit" class="btn btn--primary">新增</button>
      </form>
    </div>
  `;

  if (onBack) {
    container.querySelector('[data-action="back"]').addEventListener('click', onBack);
  }

  wireBirthDateSelects(container, { yearFieldName: 'birthDate-year', monthFieldName: 'birthDate-month', dayFieldName: 'birthDate-day' });

  for (const child of children) {
    container.querySelector(`[data-child-id="${child.id}"]`).addEventListener('click', () => onSelectChild(child));
  }

  for (const child of children) {
    container.querySelector(`[data-delete-child="${child.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${child.name}」的所有資料嗎？此操作無法復原。`)) return;
      try {
        await deleteChild(child.id);
        await renderChildListView(container, { onSelectChild, confirmDelete, onBack, reportType });
      } catch (err) {
        container.querySelector('[data-error="delete"]').textContent = '刪除失敗，請再試一次';
      }
    });
  }

  container.querySelector('[data-action="add-child"]').addEventListener('submit', async event => {
    event.preventDefault();
    const name = container.querySelector('[data-field="name"]').value;
    const birthDate = parseBirthDateSelects(container, { yearFieldName: 'birthDate-year', monthFieldName: 'birthDate-month', dayFieldName: 'birthDate-day' });
    if (!birthDate) {
      const form = container.querySelector('[data-action="add-child"]');
      let errorEl = form.querySelector('[data-error]');
      if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.dataset.error = '';
        errorEl.className = 'field-error';
        form.insertAdjacentElement('afterbegin', errorEl);
      }
      errorEl.textContent = '請選擇完整的出生日期';
      return;
    }
    try {
      await addChild({ name, birthDate });
      await renderChildListView(container, { onSelectChild, confirmDelete, onBack, reportType });
    } catch (err) {
      const form = container.querySelector('[data-action="add-child"]');
      let errorEl = form.querySelector('[data-error]');
      if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.dataset.error = '';
        errorEl.className = 'field-error';
        form.insertAdjacentElement('afterbegin', errorEl);
      }
      errorEl.textContent = '新增失敗，請再試一次';
    }
  });

  if (isParentReport) {
    const fileInput = container.querySelector('[data-field="import-parent-report-file"]');
    container.querySelector('[data-action="import-parent-report-docx"]').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length === 0) return;
      // backToList's re-render replaces this whole container's markup — including this very
      // fileInput element — with a fresh one, so there's no stale selection left to clear here.
      await processImportQueue(fileInput.files, {
        parseFn: parseParentReportDocxImport,
        renderPreview: renderParentReportImportPreviewView,
        container,
        backToList: () => renderChildListView(container, { onSelectChild, confirmDelete, onBack, reportType }),
      });
    });
  } else {
    const fileInput = container.querySelector('[data-field="import-file"]');
    container.querySelector('[data-action="import-docx"]').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length === 0) return;
      await processImportQueue(fileInput.files, {
        parseFn: parseDocxImport,
        renderPreview: renderImportPreviewView,
        container,
        backToList: () => renderChildListView(container, { onSelectChild, confirmDelete, onBack, reportType }),
      });
    });
  }
}
