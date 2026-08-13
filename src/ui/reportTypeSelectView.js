export async function renderReportTypeSelectView(container, { onSelectType }) {
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-header__title">選擇要填寫的表</h2>
    </div>
    <div class="type-select-card">
      <div class="type-select">
        <button type="button" class="btn btn--primary type-select__option" data-type="assessment">適性總表</button>
        <button type="button" class="btn btn--primary type-select__option" data-type="parent-report">適性紀錄(家長版)</button>
        <button type="button" class="btn btn--primary type-select__option" data-type="monthly-plan">課程月計畫</button>
      </div>
    </div>
  `;

  container.querySelector('[data-type="assessment"]').addEventListener('click', () => onSelectType('assessment'));
  container.querySelector('[data-type="parent-report"]').addEventListener('click', () => onSelectType('parent-report'));
  container.querySelector('[data-type="monthly-plan"]').addEventListener('click', () => onSelectType('monthly-plan'));
}
