import { describe, it, expect } from 'vitest';
import { renderReportTypeSelectView } from '../src/ui/reportTypeSelectView.js';

describe('renderReportTypeSelectView', () => {
  it('calls onSelectType with "assessment" when 適性總表 is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="assessment"]').click();
    expect(selected).toBe('assessment');
  });

  it('calls onSelectType with "parent-report" when 適性紀錄(家長版) is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="parent-report"]').click();
    expect(selected).toBe('parent-report');
  });

  it('calls onSelectType with "monthly-plan" when 課程月計畫 is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="monthly-plan"]').click();
    expect(selected).toBe('monthly-plan');
  });
});
