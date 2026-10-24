import { HELP_CHAPTERS, HELP_VIDEOS } from './helpContent.js';
import { headerButtonLabel } from './headerButtonLabel.js';
import { isMobile } from './formPopup.js';
import { mountDemo } from './helpDemo.js';

// 操作說明: a 手機版／電腦版 switch, the 完整操作教學 video for that switch with its chapter list,
// then — as backup to the video — every chapter as a card that opens and closes. Several
// chapters may be open at once — opening one never moves or closes another, so the page doesn't
// jump under the teacher's finger while a demo plays further down.
// Content is static help text from helpContent.js — no user data — so it goes in as HTML.

const MODE_KEY = 'help-mode';
const WEB_ONLY = '<p class="help-webonly">此功能僅網頁版提供</p>';
const PHONE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/></svg>';
const DESK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
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

const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const watchUrl = (video, at) => `https://youtu.be/${video.id}${at ? `?t=${at}` : ''}`;

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
      <section class="help-video" aria-labelledby="help-video-title">
        <div class="help-video__player"></div>
        <div class="help-video__side">
          <h3 class="help-video__title" id="help-video-title">影片教學</h3>
          <p class="help-video__name"></p>
          <ol class="help-video__chapters" aria-label="影片章節"></ol>
        </div>
      </section>
      <h3 class="help-section-title">文字圖解說明<small>想再看清楚某個步驟，可以展開下面的章節</small></h3>
      <div class="help-chapters">
        ${HELP_CHAPTERS.map(
          chapter => `
          <section class="help-ch">
            <h3 class="help-ch__heading">
              <button type="button" class="help-ch__head" aria-expanded="false" aria-controls="help-panel-${chapter.id}">
                <span class="help-ch__icon help-tone--${chapter.tone}">${chapter.icon}</span>
                <span class="help-ch__title">${chapter.title}<small>${chapter.desc}</small></span>
                ${CHEVRON}
              </button>
            </h3>
            <div class="help-ch__panel" id="help-panel-${chapter.id}" inert>
              <div class="help-ch__body">
                ${chapter.id in HELP_VIDEOS.desk.chapters ? `<a class="help-video__jump" data-chapter="${chapter.id}" target="_blank" rel="noopener">${PLAY_ICON}看影片的這一段</a>` : ''}
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
  const videoBox = container.querySelector('.help-video');
  const player = videoBox.querySelector('.help-video__player');
  let mounted = [];

  // A cover first, the YouTube player only once tapped, so opening 操作說明 doesn't load YouTube.
  // The offline file can't play it in the page (YouTube refuses an embed on a file:// page), so
  // there the cover and every chapter link are plain links that open YouTube at that time.
  function showVideo(at = 0, play = false) {
    const video = HELP_VIDEOS[mode];
    videoBox.dataset.mode = mode;
    videoBox.classList.toggle('is-playing', play); // 手機版's video is vertical — its frame turns so once it plays
    player.innerHTML = play
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${video.id}?rel=0&autoplay=1&start=${at}" title="${video.title}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : `<a class="help-video__cover" href="${watchUrl(video, at)}" target="_blank" rel="noopener" data-seek="${at}" style="background-image: url('https://i.ytimg.com/vi/${video.id}/hqdefault.jpg')">
          <span class="help-video__play">${PLAY_ICON}</span>
          <span class="help-video__cta">${hosted ? '播放影片' : '到 YouTube 觀看'}・約 ${video.minutes} 分鐘</span>
        </a>`;
  }

  function showVideoLinks() {
    const video = HELP_VIDEOS[mode];
    videoBox.querySelector('.help-video__name').textContent = video.title;
    videoBox.querySelector('.help-video__chapters').innerHTML = HELP_CHAPTERS.filter(chapter => chapter.id in video.chapters)
      .map(chapter => {
        const at = video.chapters[chapter.id];
        return `<li><a href="${watchUrl(video, at)}" target="_blank" rel="noopener" data-seek="${at}"><span>${clock(at)}</span>${chapter.title}</a></li>`;
      })
      .join('');
    container.querySelectorAll('.help-video__jump').forEach(jump => {
      jump.href = watchUrl(video, video.chapters[jump.dataset.chapter]);
      jump.dataset.seek = video.chapters[jump.dataset.chapter];
    });
  }

  if (hosted) {
    view.addEventListener('click', event => {
      const link = event.target.closest('[data-seek]');
      if (!link) return;
      event.preventDefault();
      showVideo(Number(link.dataset.seek), true);
      if (!videoBox.contains(link)) videoBox.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // (Re)draw the video and every demo for the current mode, in place — open chapters and scroll stay put.
  function mountDemos() {
    showVideo();
    showVideoLinks();
    mounted.forEach(demo => demo.destroy());
    mounted = [];
    view.dataset.mode = mode;
    seg.dataset.on = mode;
    seg.querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-checked', String(b.dataset.mode === mode));
      b.tabIndex = b.dataset.mode === mode ? 0 : -1; // a radio group is one tab stop; arrows move within it
    });
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
    const next = { ArrowLeft: 'phone', ArrowUp: 'phone', ArrowRight: 'desk', ArrowDown: 'desk' }[event.key];
    if (!next) return;
    event.preventDefault();
    setMode(next);
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
      const panel = section.querySelector('.help-ch__panel');
      // Closing while focus is inside: keep it on the header rather than losing it to the page.
      if (!open && panel.contains(document.activeElement)) head.focus();
      section.classList.toggle('is-open', open);
      head.setAttribute('aria-expanded', String(open));
      panel.inert = !open;
    })
  );

  mountDemos();
}
