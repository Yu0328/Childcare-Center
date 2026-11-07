// video/lib/overlay.js — injected into the page by recorder.mjs (addInitScript), defines window.__demo.
(() => {
  const BRAND = '#2a78d6';
  const css = `
    #demo-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: "Microsoft JhengHei", system-ui, sans-serif; }
    #demo-layer .cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; margin: -4px 0 0 -4px; transition-property: left, top; transition-timing-function: cubic-bezier(.4,0,.2,1);
      background: no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l16 11-7 1.5L9.5 21z' fill='%23fff' stroke='%23222' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E");
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); }
    #demo-layer .ripple { position: fixed; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 3px solid ${BRAND}; animation: demo-ripple .6s ease-out forwards; }
    @keyframes demo-ripple { to { transform: scale(4); opacity: 0; } }
    #demo-layer .ring { position: fixed; border-radius: 12px; box-shadow: 0 0 0 4px ${BRAND}, 0 0 24px 6px rgba(42,120,214,.45); opacity: 0; transition: opacity .3s; }
    #demo-layer .ring.on { opacity: 1; }
    #demo-layer .bubble { position: fixed; max-width: 360px; padding: 10px 16px; border-radius: 10px; background: ${BRAND}; color: #fff; font-size: 17px; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,.2); opacity: 0; transform: translateY(6px); transition: opacity .3s, transform .3s; }
    #demo-layer .bubble.on { opacity: 1; transform: none; }
    #demo-layer .caption { position: fixed; left: 50%; bottom: 6%; transform: translateX(-50%); max-width: 86%; padding: 12px 28px; border-radius: 12px; background: rgba(20,24,22,.78); color: #fff; font-size: 26px; line-height: 1.45; text-align: center; opacity: 0; transition: opacity .2s; }
    #demo-layer .caption.on { opacity: 1; }
    #demo-layer.phone .caption { bottom: 9%; font-size: 15px; padding: 6px 14px; border-radius: 8px; max-width: 90%; }
    #demo-layer.phone .chapter { top: 132px; right: 10px; font-size: 11px; padding: 3px 10px; }
    #demo-layer.phone .bubble { font-size: 12px; padding: 5px 10px; max-width: 200px; }
    #demo-layer.phone .cursor { width: 16px; height: 16px; margin: -2px 0 0 -2px; }
    #demo-layer.phone .ripple { border-width: 2px; }
    #demo-layer.phone .card h1 { font-size: 28px; padding: 0 20px; }
    #demo-layer.phone .card p { font-size: 15px; padding: 0 20px; }
    #demo-layer .chapter { position: fixed; top: 76px; right: 18px; padding: 5px 14px; border-radius: 999px; background: rgba(255,255,255,.92); color: ${BRAND}; font-size: 15px; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.12); opacity: 0; transition: opacity .3s; }
    #demo-layer .chapter.on { opacity: 1; }
    #demo-layer .card { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: linear-gradient(135deg, #f4f4f1, #dceafb); color: #1f2422; opacity: 0; transition: opacity .6s; }
    #demo-layer .card.on { opacity: 1; }
    #demo-layer .confirm { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); width: min(460px, 92vw); padding: 22px 24px 18px; border-radius: 12px; background: #fff; color: #1f2422; box-shadow: 0 10px 32px rgba(0,0,0,.28); font-size: 15px; opacity: 0; transition: opacity .2s; }
    #demo-layer .confirm.on { opacity: 1; }
    #demo-layer .confirm b { display: block; margin-bottom: 12px; font-size: 15px; }
    #demo-layer .confirm p { margin: 0 0 18px; line-height: 1.5; white-space: pre-wrap; }
    #demo-layer .confirm .row { display: flex; justify-content: flex-end; gap: 8px; }
    #demo-layer .confirm span { padding: 7px 18px; border-radius: 999px; border: 1px solid #c7d0cc; color: #1c5cab; }
    #demo-layer .confirm span.ok { background: #1c5cab; border-color: #1c5cab; color: #fff; }
    #demo-layer .card h1 { margin: 0; font-size: 48px; color: #1c5cab; text-align: center; padding: 0 40px; }
    #demo-layer .card p { margin: 0; font-size: 24px; color: #55605c; text-align: center; padding: 0 40px; }
  `;
  let layer;
  const $ = sel => layer.querySelector(sel);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function ensure() {
    if (layer) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    layer = document.createElement('div');
    layer.id = 'demo-layer';
    if (innerWidth < innerHeight) layer.classList.add('phone');
    layer.innerHTML = '<div class="confirm"><b>yu0328.github.io 顯示</b><p></p><div class="row"><span>取消</span><span class="ok">確定</span></div></div><div class="card"><h1></h1><p></p></div><div class="ring"></div><div class="bubble"></div><div class="chapter"></div><div class="caption"></div><div class="cursor"></div>';
    document.documentElement.appendChild(layer);
    Object.assign($('.cursor').style, { left: `${innerWidth * 0.6}px`, top: `${innerHeight * 0.6}px` });
  }

  // Current body transform, so a zoom can be measured from unzoomed coordinates.
  let view = { tx: 0, ty: 0, s: 1 };
  function applyView(ms) {
    document.body.style.transformOrigin = '0 0';
    document.body.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
    document.body.style.transform = view.s === 1 ? '' : `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
    return sleep(ms);
  }

  window.__demo = {
    moveTo(x, y, ms) {
      ensure();
      const c = $('.cursor');
      c.style.transitionDuration = `${ms}ms`;
      Object.assign(c.style, { left: `${x}px`, top: `${y}px` });
      return sleep(ms);
    },
    ripple(x, y) {
      ensure();
      const r = document.createElement('div');
      r.className = 'ripple';
      Object.assign(r.style, { left: `${x}px`, top: `${y}px` });
      layer.appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
    ring(rect, label) {
      ensure();
      const pad = 8;
      Object.assign($('.ring').style, { left: `${rect.x - pad}px`, top: `${rect.y - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
      $('.ring').classList.add('on');
      const b = $('.bubble');
      if (!label) { b.classList.remove('on'); return; }
      b.textContent = label;
      // Below the target if there is room, else above; clamped inside the viewport.
      const below = rect.y + rect.height + pad + 16;
      b.style.left = `${Math.max(8, Math.min(rect.x, innerWidth - b.offsetWidth - 8))}px`;
      b.style.top = below + 60 < innerHeight ? `${below}px` : `${Math.max(16, rect.y - pad - 70)}px`;
      b.classList.add('on');
    },
    clearRing() {
      ensure();
      $('.ring').classList.remove('on');
      $('.bubble').classList.remove('on');
    },
    caption(text) {
      ensure();
      const c = $('.caption');
      if (text) c.textContent = text;
      c.classList.toggle('on', Boolean(text));
    },
    card(title, subtitle = '') {
      ensure();
      $('.card h1').textContent = title;
      $('.card p').textContent = subtitle;
      $('.card').classList.add('on');
    },
    hideCard() {
      ensure();
      $('.card').classList.remove('on');
      return sleep(600);
    },
    // A drawn stand-in for the browser's own confirm(), which a headless recording can't show.
    // Returns the 確定 button's centre for the cursor.
    confirm(message) {
      ensure();
      const box = $('.confirm');
      box.querySelector('p').textContent = message;
      box.classList.add('on');
      const ok = box.querySelector('.ok').getBoundingClientRect();
      return { x: ok.x + ok.width / 2, y: ok.y + ok.height / 2 };
    },
    hideConfirm() {
      ensure();
      $('.confirm').classList.remove('on');
    },
    chapter(text) {
      ensure();
      const c = $('.chapter');
      if (text) c.textContent = text;
      c.classList.toggle('on', Boolean(text));
    },
    // Scales <body> about the target's centre, clamped so no page edge comes into view.
    // shortcut: assumes no scrolling while zoomed; unzoom before scrolling.
    zoom(rect, s, ms) {
      ensure();
      const cx = (rect.x + rect.width / 2 - view.tx) / view.s + scrollX;
      const cy = (rect.y + rect.height / 2 - view.ty) / view.s + scrollY;
      const W = document.body.scrollWidth;
      const H = document.body.scrollHeight;
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      view = {
        s,
        tx: clamp(innerWidth / 2 + scrollX - s * cx, scrollX + innerWidth - s * W, scrollX),
        ty: clamp(innerHeight / 2 + scrollY - s * cy, scrollY + innerHeight - s * H, scrollY),
      };
      return applyView(ms);
    },
    unzoom(ms) {
      view = { tx: 0, ty: 0, s: 1 };
      return applyView(ms);
    },
  };
})();
