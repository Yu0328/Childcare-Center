import { HELP_CHAPTERS } from './helpContent.js';
import { headerButtonLabel } from './headerButtonLabel.js';
import { isMobile } from './formPopup.js';

// Content is static help text from helpContent.js — no user data — so it goes in as HTML.
export async function renderHelpView(container, { onBack, hosted = false, chapterId = null, sectionId = null }) {
  const phone = isMobile();
  const index = HELP_CHAPTERS.findIndex(chapter => chapter.id === chapterId);
  // Desktop always has a chapter open; a phone shows the table of contents until one is chosen.
  const current = index >= 0 ? index : phone ? -1 : 0;
  const chapter = HELP_CHAPTERS[current];
  const rerender = (nextChapterId, nextSectionId = null) =>
    renderHelpView(container, { onBack, hosted, chapterId: nextChapterId, sectionId: nextSectionId });

  // Chapter numbers are drawn by CSS from data-num, so a title element's text is just the title.
  const tocHtml = `
    <nav class="help-toc" aria-label="目錄">
      <ol class="help-toc__list">
        ${HELP_CHAPTERS.map(
          (item, i) => `
            <li>
              <button type="button" class="help-toc__item" data-chapter="${item.id}"${i === current ? ' aria-current="true"' : ''}>
                <span class="help-toc__num" data-num="${i + 1}"></span>${item.title}
              </button>
              ${
                item.sections
                  ? `<ol class="help-toc__sub">${item.sections
                      .map(
                        section =>
                          `<li><button type="button" class="help-toc__subitem" data-chapter="${item.id}" data-section="${section.id}">${section.title}</button></li>`
                      )
                      .join('')}</ol>`
                  : ''
              }
            </li>`
        ).join('')}
      </ol>
    </nav>`;

  const chapterHtml = chapter
    ? `
    <article class="help-chapter">
      <h2 class="help-chapter__title"><span class="help-chapter__num" data-num="${current + 1}"></span>${chapter.title}</h2>
      ${chapter.html}
      <div class="help-chapter__nav">
        ${current > 0 ? `<button type="button" class="btn btn--ghost" data-nav="prev">‹ 上一章</button>` : '<span></span>'}
        ${current < HELP_CHAPTERS.length - 1 ? `<button type="button" class="btn btn--ghost" data-nav="next">下一章 ›</button>` : ''}
      </div>
    </article>`
    : '';

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">${headerButtonLabel(phone && chapter ? '← 返回目錄' : '← 返回首頁', '← 返回')}</button>
      <h2 class="page-header__title">操作說明</h2>
    </div>
    <div class="help-layout">
      ${phone && chapter ? '' : tocHtml}
      ${chapterHtml}
    </div>
  `;

  if (hosted) container.querySelectorAll('.help-webonly').forEach(note => note.remove());

  container.querySelector('[data-action="back"]').addEventListener('click', () => {
    if (phone && chapter) rerender(null);
    else onBack();
  });
  container.querySelectorAll('[data-chapter]').forEach(button =>
    button.addEventListener('click', () => rerender(button.dataset.chapter, button.dataset.section || null))
  );
  container.querySelector('[data-nav="prev"]')?.addEventListener('click', () => rerender(HELP_CHAPTERS[current - 1].id));
  container.querySelector('[data-nav="next"]')?.addEventListener('click', () => rerender(HELP_CHAPTERS[current + 1].id));

  const target = sectionId && container.querySelector(`#help-section-${sectionId}`);
  if (target) target.scrollIntoView?.({ block: 'start' });
  else if (chapterId) window.scrollTo(0, 0);
}
