import { device } from './helpMiniScreens.js';

// One 操作說明 demo: a device frame that plays a task's steps on a loop — a finger dot (phone) or
// arrow (computer) moves to the ringed button, presses it with a ripple, and the screen
// cross-fades to the next step — beside a numbered step list that follows along.
// demo: { title, lead?, note?, steps: [{ cap: string | { desk, phone }, draw(mode) → html, point? }] }
// A `point` step moves the pointer to its ringed spot without pressing (for "this is where…").
// A step with `modes: ['phone']` (or ['desk']) only exists on that kind of device — e.g. pressing
// the round ＋ that a phone needs before its add form shows.

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>';
const ARROW =
  '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M2 1.5l15 12.2-6.6.8 3.9 7.4-3 1.5-3.8-7.5L2 20z" fill="#1f2422" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const caption = (step, mode) => (typeof step.cap === 'string' ? step.cap : step.cap[mode]);

export function mountDemo(el, demo, { mode, reduced = false }) {
  const steps = demo.steps.filter(step => !step.modes || step.modes.includes(mode));
  let index = 0;
  let token = 0; // bumped to cancel a running loop
  let playing = !reduced; // reduced motion: start paused on a still frame
  let visible = false;
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const wait = ms => new Promise(resolve => later(resolve, ms));

  el.dataset.mode = mode;
  el.innerHTML = `
    <h4 class="help-demo__title">${demo.title}</h4>
    ${demo.lead ? `<p class="help-demo__lead">${demo.lead}</p>` : ''}
    <div class="help-demo__grid">
      <div class="help-demo__stagebox">
        <div class="help-demo__stage">${device(mode)}</div>
        <div class="help-demo__ctrl">
          <button type="button" class="help-demo__play"></button>
          <div class="help-demo__dots">${steps
            .map((_, i) => `<button type="button" class="help-demo__dot" data-go="${i}" aria-label="第 ${i + 1} 步"></button>`)
            .join('')}</div>
        </div>
      </div>
      <div>
        <ol class="help-demo__steps">${steps
          .map((step, i) => `<li><button type="button" data-go="${i}"><span class="help-demo__n">${i + 1}</span><span>${caption(step, mode)}</span></button></li>`)
          .join('')}</ol>
        ${demo.note ? `<p class="help-demo__note">${demo.note}</p>` : ''}
      </div>
    </div>`;

  const screenEl = el.querySelector('.help-dev__screen');
  screenEl.classList.add('rings');
  const pointer = document.createElement('div');
  pointer.className = `help-cur help-cur--${mode === 'phone' ? 'finger' : 'arrow'}`;
  pointer.innerHTML = mode === 'phone' ? '<i></i>' : `<i>${ARROW}</i>`;
  screenEl.append(pointer);
  const playButton = el.querySelector('.help-demo__play');

  function syncPlay() {
    playButton.innerHTML = playing ? `${ICON_PAUSE}暫停` : `${ICON_PLAY}播放`;
    screenEl.classList.toggle('pulse', !playing);
  }

  function show(i, fade = true) {
    index = i;
    const old = [...screenEl.querySelectorAll('.ms')];
    pointer.insertAdjacentHTML('beforebegin', steps[i].draw(mode));
    const frame = pointer.previousElementSibling;
    if (fade && old.length) {
      frame.classList.add('ms--in');
      later(() => old.forEach(o => o.remove()), 460);
    } else {
      old.forEach(o => o.remove());
    }
    el.querySelectorAll('[data-go]').forEach(b => b.removeAttribute('aria-current'));
    el.querySelectorAll(`[data-go="${i}"]`).forEach(b => b.setAttribute('aria-current', 'step'));
    return frame;
  }

  function stop() {
    token++;
    timers.forEach(clearTimeout);
    timers.clear();
    pointer.classList.remove('show', 'tap');
    // The cancelled timers would have cleared these: a cross-fading old frame and ripples.
    screenEl.querySelectorAll('.ms').forEach(frame => frame !== pointer.previousElementSibling && frame.remove());
    screenEl.querySelectorAll('.help-rip').forEach(ripple => ripple.remove());
  }

  async function run() {
    if (!playing || !visible) return;
    const mine = ++token;
    const live = () => mine === token && el.isConnected;
    let first = true;
    while (live()) {
      // On (re)start keep the frame already showing instead of flashing it again.
      const frame = first ? pointer.previousElementSibling : show(index);
      first = false;
      if (index === 0) {
        pointer.classList.remove('show');
        const s = screenEl.getBoundingClientRect();
        pointer.style.transform = `translate(${s.width * 0.8}px, ${s.height * 0.96}px)`;
      }
      await wait(800);
      if (!live()) return;
      const target = frame.querySelector('[data-hit]');
      if (!target) {
        // Last frame (the result): hold it, then start over.
        pointer.classList.remove('show');
        await wait(2600);
        if (!live()) return;
        index = 0;
        continue;
      }
      const s = screenEl.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const x = r.left - s.left + r.width / 2;
      const y = r.top - s.top + r.height / 2;
      pointer.classList.add('show');
      pointer.style.transform = `translate(${x}px, ${y}px)`;
      await wait(950);
      if (!live()) return;
      if (steps[index].point) {
        await wait(1400);
      } else {
        pointer.classList.add('tap');
        const ripple = document.createElement('span');
        ripple.className = 'help-rip';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        screenEl.append(ripple);
        later(() => ripple.remove(), 650);
        target.classList.add('is-pressed');
        await wait(220);
        pointer.classList.remove('tap');
        await wait(450);
      }
      if (!live()) return;
      if (index === steps.length - 1) {
        // Last step pressed or pointed at: hold the frame a moment before starting over.
        pointer.classList.remove('show');
        await wait(2000);
        if (!live()) return;
      }
      index = (index + 1) % steps.length;
    }
  }

  // Removed by destroy(): the same <article> is re-mounted on every 手機版／電腦版 switch.
  const listeners = new AbortController();
  el.addEventListener('click', event => {
    const go = event.target.closest('[data-go]');
    if (go) {
      stop();
      show(Number(go.dataset.go));
      if (playing) later(run, 0);
    }
    if (event.target.closest('.help-demo__play')) {
      playing = !playing;
      syncPlay();
      if (playing) {
        if (!screenEl.querySelector('.ms [data-hit]')) show(0); // on the finished frame: start over
        run();
      } else {
        stop();
      }
    }
  }, { signal: listeners.signal });

  // Plays only while at least 35% on screen; a closed chapter's demo is clipped to nothing.
  // No IntersectionObserver (jsdom) → never autoplays.
  let observer = null;
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (!el.isConnected) return destroy();
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        if (visible) run();
        else stop();
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
  }

  // Safari before 16 (the center's MacBook runs 15.5) has no container units, so .ms's
  // calc(100cqw / n) font-size is dropped; size the drawing from the frame's width here instead.
  let resizer = null;
  if (typeof CSS !== 'undefined' && !CSS.supports('width', '1cqw') && typeof ResizeObserver === 'function') {
    const perWidth = mode === 'desk' ? 46 : 22; // same divisors as .ms in styles.css
    resizer = new ResizeObserver(([entry]) => {
      screenEl.style.fontSize = `${entry.contentRect.width / perWidth}px`;
    });
    resizer.observe(screenEl);
  }

  function destroy() {
    stop();
    observer?.disconnect();
    resizer?.disconnect();
    listeners.abort();
  }

  syncPlay();
  show(0, false);
  return { destroy };
}
