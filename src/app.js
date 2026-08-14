import { renderChildListView } from './ui/childListView.js';
import { renderFormListView } from './ui/formListView.js';
import { renderFormEditorView } from './ui/formEditorView.js';
import { renderReportTypeSelectView } from './ui/reportTypeSelectView.js';
import { renderParentReportListView } from './ui/parentReportListView.js';
import { renderParentReportEditorView } from './ui/parentReportEditorView.js';
import { renderAggregateCoursePlanView } from './ui/aggregateCoursePlanView.js';
import { renderMonthlyPlanListView } from './ui/monthlyPlanListView.js';
import { renderMonthlyPlanEditorView } from './ui/monthlyPlanEditorView.js';
import { exportBackup, importBackup } from './storage/backup.js';
import { downloadBlob } from './export/downloadBlob.js';
import { isUnlocked, renderPasswordGate } from './auth/passwordGate.js';

const RENDER_FAILED_MESSAGE = '載入失敗，請重新整理頁面';
const EXPORT_FAILED_MESSAGE = '匯出失敗，請再試一次';
const IMPORT_FAILED_MESSAGE = '匯入失敗，請再試一次';
const IMPORT_CONFIRM_MESSAGE = '匯入備份會清除目前所有資料，確定要繼續嗎？';

export function mountApp(container) {
  function showRenderError() {
    container.textContent = '';
    const message = document.createElement('p');
    message.dataset.error = 'render';
    message.className = 'field-error field-error--center';
    message.textContent = RENDER_FAILED_MESSAGE;
    container.appendChild(message);
  }

  function showReportTypeSelect() {
    renderReportTypeSelectView(container, {
      onSelectType: type => (type === 'monthly-plan' ? showMonthlyPlanList() : showChildList(type)),
    }).catch(showRenderError);
  }

  function showMonthlyPlanList() {
    renderMonthlyPlanListView(container, {
      onSelectPlan: plan => showMonthlyPlanEditor(plan),
      onBack: showReportTypeSelect,
    }).catch(showRenderError);
  }

  function showMonthlyPlanEditor(plan) {
    renderMonthlyPlanEditorView(container, { plan, onBack: showMonthlyPlanList }).catch(showRenderError);
  }

  function showChildList(reportType) {
    renderChildListView(container, {
      onSelectChild: child => (reportType === 'parent-report' ? showParentReportList(child) : showFormList(child)),
      onBack: showReportTypeSelect,
      reportType,
    }).catch(showRenderError);
  }

  function showFormList(child) {
    renderFormListView(container, {
      child,
      onSelectForm: form => showFormEditor(child, form),
      onBack: () => showChildList('assessment'),
      onAggregate: () => showAggregateSelect(child),
    }).catch(showRenderError);
  }

  function showAggregateSelect(child) {
    renderAggregateCoursePlanView(container, {
      child,
      onCreated: form => showFormEditor(child, form),
      onBack: () => showFormList(child),
    }).catch(showRenderError);
  }

  function showFormEditor(child, form) {
    renderFormEditorView(container, { child, form, onBack: () => showFormList(child) }).catch(showRenderError);
  }

  function showParentReportList(child) {
    renderParentReportListView(container, {
      child,
      onSelectReport: report => showParentReportEditor(child, report),
      onBack: () => showChildList('parent-report'),
    }).catch(showRenderError);
  }

  function showParentReportEditor(child, report) {
    renderParentReportEditorView(container, { child, report, onBack: () => showParentReportList(child) }).catch(showRenderError);
  }

  if (isUnlocked()) {
    showReportTypeSelect();
  } else {
    renderPasswordGate(container, { onUnlock: showReportTypeSelect });
  }
}

export function wireBackupControls({
  exportButton,
  importInput,
  messageContainer = exportButton.closest('header') || exportButton.parentNode,
  confirmImport = message => (typeof confirm === 'function' ? confirm(message) : false),
  reload = () => window.location.reload(),
}) {
  // Export and import controls can live in different DOM branches (e.g. the import input is
  // wrapped in its own <label>), so feedback always targets one shared container rather than
  // each control's own parent — otherwise a success on one control can clear the other's message.
  function showMessage(text) {
    let errorEl = messageContainer.querySelector('[data-error="backup"]');
    if (!text) {
      if (errorEl) errorEl.remove();
      return;
    }
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.dataset.error = 'backup';
      errorEl.className = 'field-error';
      messageContainer.appendChild(errorEl);
    }
    errorEl.textContent = text;
  }

  exportButton.addEventListener('click', async () => {
    try {
      const json = await exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      downloadBlob(blob, `c-form-backup-${new Date().toISOString().slice(0, 10)}.json`);
      showMessage('');
    } catch (err) {
      showMessage(EXPORT_FAILED_MESSAGE);
    }
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;

    // Importing wipes every existing record, so always ask first.
    if (!confirmImport(IMPORT_CONFIRM_MESSAGE)) {
      importInput.value = '';
      return;
    }

    try {
      const text = await file.text();
      await importBackup(text);
      showMessage('');
    } catch (err) {
      // Do not reload after a failed import: the store may be half-written and a reload
      // would hide that behind a fresh render.
      importInput.value = '';
      showMessage(IMPORT_FAILED_MESSAGE);
      return;
    }

    reload();
  });
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  mountApp(document.getElementById('app'));
}
