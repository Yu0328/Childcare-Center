import { renderChildListView } from './ui/childListView.js';
import { renderFormListView } from './ui/formListView.js';
import { renderFormEditorView } from './ui/formEditorView.js';
import { renderReportTypeSelectView } from './ui/reportTypeSelectView.js';
import { renderParentReportListView } from './ui/parentReportListView.js';
import { renderParentReportEditorView } from './ui/parentReportEditorView.js';
import { renderAggregateCoursePlanView } from './ui/aggregateCoursePlanView.js';
import { renderMonthlyPlanListView } from './ui/monthlyPlanListView.js';
import { renderMonthlyPlanEditorView } from './ui/monthlyPlanEditorView.js';
import { exportBackup, importBackup, importHugeBackupFile, HUGE_IMPORT_THRESHOLD_BYTES } from './storage/backup.js';
import { downloadBlob } from './export/downloadBlob.js';
import { isUnlocked, renderPasswordGate } from './auth/passwordGate.js';

const RENDER_FAILED_MESSAGE = '載入失敗，請重新整理頁面';
const EXPORT_FAILED_MESSAGE = '匯出失敗，請再試一次';
const IMPORT_FAILED_MESSAGE = '匯入失敗，請再試一次';
const IMPORT_CONFIRM_MESSAGE = '匯入備份會清除目前所有資料，確定要繼續嗎？';

export function mountApp(container, { onUnlock } = {}) {
  function showRenderError(err) {
    container.textContent = '';
    const message = document.createElement('p');
    message.dataset.error = 'render';
    message.className = 'field-error field-error--center';
    // See the export-failure handler below for why the raw error is appended rather than just
    // showing the generic message.
    message.textContent = `${RENDER_FAILED_MESSAGE}（${err?.message || err}）`;
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

  const homeButton = document.getElementById('home-button');
  if (homeButton) homeButton.addEventListener('click', showReportTypeSelect);

  function handleUnlock() {
    showReportTypeSelect();
    if (onUnlock) onUnlock();
  }

  if (isUnlocked()) {
    showReportTypeSelect();
  } else {
    renderPasswordGate(container, { onUnlock: handleUnlock });
  }
}

export function wireBackupControls({
  exportButton,
  importInput,
  messageContainer = exportButton.closest('header') || exportButton.parentNode,
  confirmImport = message => (typeof confirm === 'function' ? confirm(message) : false),
  reload = () => window.location.reload(),
}) {
  // Bug fix (Critical): these controls live in the page header, outside mountApp's
  // password-gated container, and used to be wired unconditionally on page load — anyone who
  // opened the page, locked or not, could export every child's data or wipe it via import with
  // no password. Gated two ways: disabled by default and re-checked on every click/change (so a
  // host page that forgets to call updateLockState() after unlock still can't be tricked by
  // re-enabling the button via devtools — the handler itself refuses), AND kept disabled until
  // updateLockState() is called (wire this to mountApp's onUnlock hook).
  function updateLockState() {
    const locked = !isUnlocked();
    exportButton.disabled = locked;
    importInput.disabled = locked;
  }
  updateLockState();

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

  // Exporting can take a while once 點滴分享 photos pile up across children, so show a small
  // fill bar to the left of the export button (updated per-child by exportBackup's onProgress
  // callback) instead of leaving it looking unresponsive. A custom div pair rather than a
  // native <progress> — <progress>'s fill can't be given a smooth CSS transition consistently
  // across browsers, and per-child steps without one look like a jumpy snap rather than a glide.
  function showProgress(done, total) {
    const container = exportButton.parentNode;
    let bar = container.querySelector('[data-progress="backup"]');
    if (!bar) {
      bar = document.createElement('div');
      bar.dataset.progress = 'backup';
      bar.className = 'backup-progress';
      bar.innerHTML = '<div class="backup-progress__fill"></div>';
      container.insertBefore(bar, exportButton);
    }
    const percent = total > 0 ? (done / total) * 100 : 100;
    bar.firstElementChild.style.width = `${percent}%`;
  }
  function hideProgress() {
    exportButton.parentNode.querySelector('[data-progress="backup"]')?.remove();
  }

  exportButton.addEventListener('click', async () => {
    if (!isUnlocked()) return; // belt-and-suspenders: the button should already be disabled
    try {
      const parts = await exportBackup(showProgress);
      const blob = new Blob(parts, { type: 'application/json' });
      downloadBlob(blob, `${new Date().toISOString().slice(0, 10)}_備份.json`);
      showMessage('');
    } catch (err) {
      // The generic message alone gives no way to diagnose device-specific failures (e.g. Safari-only
      // bugs already found this way) — showing the actual error inline means the person hitting it can
      // just read/relay it instead of needing devtools access, which may not even be reachable on iOS.
      showMessage(`${EXPORT_FAILED_MESSAGE}（${err?.message || err}）`);
    } finally {
      hideProgress();
    }
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    if (!isUnlocked()) { importInput.value = ''; return; } // belt-and-suspenders: see updateLockState above

    // Importing wipes every existing record, so always ask first.
    if (!confirmImport(IMPORT_CONFIRM_MESSAGE)) {
      importInput.value = '';
      return;
    }

    try {
      // A file at/above the threshold can't be read via file.text() at all (same V8
      // string-length ceiling exportBackup() used to hit) — stream it instead.
      if (file.size >= HUGE_IMPORT_THRESHOLD_BYTES) {
        await importHugeBackupFile(file);
      } else {
        const text = await file.text();
        await importBackup(text);
      }
      showMessage('');
    } catch (err) {
      // Do not reload after a failed import: the store may be half-written and a reload
      // would hide that behind a fresh render.
      importInput.value = '';
      showMessage(`${IMPORT_FAILED_MESSAGE}（${err?.message || err}）`);
      return;
    }

    reload();
  });

  return { updateLockState };
}
