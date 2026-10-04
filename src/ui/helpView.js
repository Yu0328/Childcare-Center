import { HELP_CHAPTERS } from './helpContent.js';
import { headerButtonLabel } from './headerButtonLabel.js';
import { isMobile } from './formPopup.js';
import { mountDemo } from './helpDemo.js';

// 操作說明: a 手機版／電腦版 switch, then every chapter as a card that opens and closes. Several
// chapters may be open at once — opening one never moves or closes another, so the page doesn't
// jump under the teacher's finger while a demo plays further down.
// Content is static help text from helpContent.js — no user data — so it goes in as HTML.

const MODE_KEY = 'help-mode';
const WEB_ONLY = '<p class="help-webonly">此功能僅網頁版提供</p>';
const PHONE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/></svg>';
const DESK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
const CHEVRON =
  '<svg class="help-ch__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function savedMode() {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    if (mode === 'phone' || mode === 'desk') return mode;
  } catch {
    // storage blocked — fall back to the device
  }
  return isMobile() ? 'phone' : 'desk';
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function renderHelpView(container, { onBack, hosted = false }) {
  let mode = savedMode();
  const demosById = new Map(HELP_CHAPTERS.flatMap(chapter => (chapter.demos || []).map(demo => [demo.id, demo])));

  container.innerHTML = `
    <div class="help-view" data-mode="${mode}">
      <div class="page-header page-header--editor help-view__header">
        <button type="button" class="btn btn--ghost" data-action="back">${headerButtonLabel('← 返回首頁', '← 返回')}</button>
        <h2 class="page-header__title">操作說明</h2>
        <div class="help-seg" role="radiogroup" aria-label="要看哪一種畫面的說明">
          <button type="button" role="radio" data-mode="phone">${PHONE_ICON}手機版</button>
          <button type="button" role="radio" data-mode="desk">${DESK_ICON}電腦版</button>
        </div>
      </div>
      <div class="help-chapters">
        ${HELP_CHAPTERS.map(
          (chapter, i) => `
          <section class="help-ch${i === 0 ? ' is-open' : ''}">
            <h3 class="help-ch__heading">
              <button type="button" class="help-ch__head" aria-expanded="${i === 0}" aria-controls="help-panel-${chapter.id}">
                <span class="help-ch__icon help-tone--${chapter.tone}">${chapter.icon}</span>
                <span class="help-ch__title">${chapter.title}<small>${chapter.desc}</small></span>
                ${CHEVRON}
              </button>
            </h3>
            <div class="help-ch__panel" id="help-panel-${chapter.id}"${i === 0 ? '' : ' inert'}>
              <div class="help-ch__body">
                ${chapter.intro ? `<p class="help-ch__intro">${chapter.intro}</p>` : ''}
                ${(chapter.demos || [])
                  .map(demo => `${demo.webOnly ? WEB_ONLY : ''}<article class="help-demo" data-demo="${demo.id}"></article>`)
                  .join('')}
                ${chapter.html || ''}
              </div>
            </div>
          </section>`
        ).join('')}
      </div>
    </div>
  `;

  // On the web: drop the 「此功能僅網頁版提供」 notes and the tip that's only about the offline file.
  if (hosted) container.querySelectorAll('.help-webonly, .help-offlineonly').forEach(note => note.remove());

  const view = container.querySelector('.help-view');
  const seg = container.querySelector('.help-seg');
  let mounted = [];

  // (Re)draw every demo for the current mode, in place — open chapters and scroll stay put.
  function mountDemos() {
    mounted.forEach(demo => demo.destroy());
    mounted = [];
    view.dataset.mode = mode;
    seg.dataset.on = mode;
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    container.querySelectorAll('.help-demo').forEach(el => {
      const demo = demosById.get(el.dataset.demo);
      const shown = !demo.modes || demo.modes.includes(mode);
      el.hidden = !shown;
      if (el.previousElementSibling?.classList.contains('help-webonly')) el.previousElementSibling.hidden = !shown;
      if (shown) mounted.push(mountDemo(el, demo, { mode, reduced: reducedMotion() }));
      else el.innerHTML = '';
    });
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // not remembered — fine
    }
    if (document.startViewTransition && !reducedMotion()) document.startViewTransition(mountDemos);
    else mountDemos();
  }

  seg.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) setMode(button.dataset.mode);
  });
  seg.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setMode(event.key === 'ArrowLeft' ? 'phone' : 'desk');
    seg.querySelector(`[data-mode="${mode}"]`).focus();
  });

  container.querySelector('[data-action="back"]').addEventListener('click', () => {
    mounted.forEach(demo => demo.destroy());
    onBack();
  });

  container.querySelectorAll('.help-ch__head').forEach(head =>
    head.addEventListener('click', () => {
      const section = head.closest('.help-ch');
      const open = !section.classList.contains('is-open');
      section.classList.toggle('is-open', open);
      head.setAttribute('aria-expanded', String(open));
      section.querySelector('.help-ch__panel').inert = !open;
    })
  );

  mountDemos();
}
