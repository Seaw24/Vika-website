import { esc, icon } from '../ui.js?v=20261012t';
import { nearby, afterLeave } from '../lib/tiktok.js?v=20261012t';

// The TikTok feed (Nam, 2026-10-11): one video per screen in a snapping scroller, as on TikTok. The video on screen
// plays and loops; its two neighbours keep their source and the rest drop it. The feed knows nothing about posting
// or skipping: the page passes each video's side buttons and overlay text, and hears which button she pressed.
const SOUND_KEY = 'studio.tiktok.sound';
const soundStore = {
  get() { try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; } },
  set(on) { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ } },
};
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const typing = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));

export function createFeed(host, { videos, startId = null, urlOf, posterOf = () => null, playable = () => true,
  buttons, overlay, onAct = () => {}, onActive = () => {}, onEmpty = () => {} }) {
  const list = [...videos];
  let activeId = null;
  let sound = soundStore.get();
  let held = false;
  let started = false;
  let dead = false;
  let emptied = false;
  let frame = 0;
  const born = performance.now();

  const videoOf = (id) => list.find((v) => v.id === id);
  // A leaving video is already out of the list, so it is no longer an item.
  const items = () => [...el.querySelectorAll('.ttf-item:not(.is-leaving)')];
  const itemOf = (id) => (id == null ? null : el.querySelector(`.ttf-item[data-id="${CSS.escape(id)}"]`));

  /* ---------- Markup ---------- */

  const rail = (video) => buttons(video).map((b) => `<button type="button" class="ttf-btn${b.strong ? ' is-strong' : ''}${b.done ? ' is-done' : ''}" data-act="${esc(b.act)}">
      <span class="ttf-ic">${icon(b.done ? 'check' : b.icon)}</span><span class="ttf-lbl">${esc(b.label)}</span></button>`).join('');
  const info = (video) => overlay(video, list.indexOf(video) + 1, list.length);
  const poster = (video) => {
    const url = posterOf(video);
    return `<img class="ttf-poster" alt="" decoding="async"${url ? ` src="${esc(url)}"` : ''}>`;
  };
  // Browsers block sound until a tap, so a feed without the remembered choice starts muted with Bật tiếng showing.
  const player = (video) => (playable(video)
    ? `<video playsinline loop preload="none"${sound ? '' : ' muted'} disablepictureinpicture controlslist="nodownload noremoteplayback"></video>
      <span class="ttf-mark" aria-hidden="true">${icon('play')}</span>
      <button type="button" class="ttf-sound" data-feed="sound" aria-label="${sound ? 'Tắt tiếng' : 'Bật tiếng'}"><span class="ttf-off">${icon('mute')}</span><span class="ttf-on">${icon('sound')}</span><span class="ttf-sound-lbl">Bật tiếng</span></button>
      <input class="ttf-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Tua video">`
    : '<div class="ttf-msg"><p>Đã xoá file.</p></div>');
  const item = (video) => `<section class="ttf-item" data-id="${esc(video.id)}" aria-label="${esc(video.title)}">
    <div class="ttf-stage">${poster(video)}${player(video)}<span class="ttf-shade" aria-hidden="true"></span><div class="ttf-info">${info(video)}</div></div>
    <div class="ttf-rail">${rail(video)}</div></section>`;

  const el = document.createElement('div');
  el.className = `ttf${sound ? '' : ' is-muted'}`;
  el.innerHTML = `${list.map(item).join('')}<div class="ttf-nav">
    <button type="button" data-feed="up" aria-label="Video trước">${icon('up')}</button>
    <button type="button" data-feed="down" aria-label="Video sau">${icon('down')}</button></div>`;

  /* ---------- Playback ---------- */

  async function load(node, { fresh = false } = {}) {
    const media = node.querySelector('video');
    if (!media || (media.getAttribute('src') && !fresh)) return;
    const url = await urlOf(videoOf(node.dataset.id), { fresh });
    if (!url) throw new Error('no link');
    if (!node.isConnected || dead) return;
    // A link that arrives late must not wake a video she has scrolled far past.
    const all = items();
    const at = all.findIndex((n) => n.dataset.id === activeId);
    if (at < 0 || !nearby(at, all.length).includes(all.indexOf(node))) return;
    if (fresh || !media.getAttribute('src')) media.src = url;
  }

  function fail(node) {
    if (node.querySelector('.ttf-msg')) return;
    node.querySelector('.ttf-stage').insertAdjacentHTML('beforeend',
      '<div class="ttf-msg"><p>Chưa tải được video.</p><button type="button" class="btn btn-gold sm" data-feed="retry">Thử lại</button></div>');
  }

  async function play(node, { fresh = false } = {}) {
    const media = node?.querySelector('video');
    if (!media) return;
    node.querySelector('.ttf-msg')?.remove();
    try { await load(node, { fresh }); } catch { fail(node); return; }
    if (node.dataset.id !== activeId || dead) return;
    media.preload = 'auto';
    media.muted = !sound;
    if (media.currentTime) media.currentTime = 0;
    node.classList.remove('is-paused');
    if (held || document.hidden) return;
    try { await media.play(); } catch (error) {
      if (error.name === 'NotAllowedError' && !media.muted) {
        // The browser wants a tap before sound: play muted and show Bật tiếng until she taps it.
        setSound(false, { remember: false });
        media.play().catch(() => node.classList.add('is-paused'));
      } else if (error.name === 'NotAllowedError') node.classList.add('is-paused');
    }
  }

  function activate(id) {
    if (dead || activeId === id) return;
    const all = items();
    const at = all.findIndex((n) => n.dataset.id === id);
    if (at < 0) return;
    activeId = id;
    const keep = new Set(nearby(at, all.length));
    all.forEach((node, i) => {
      const media = node.querySelector('video');
      if (!media || i === at) return;
      media.pause();
      node.classList.remove('is-paused');
      if (keep.has(i)) {
        media.preload = 'metadata';
        load(node).catch(() => {});
      } else if (media.getAttribute('src')) {
        media.removeAttribute('src');
        media.load();
      }
    });
    play(all[at]);
    paintNav();
    onActive(videoOf(id));
  }

  // A tap on the video pauses or plays it, as on TikTok.
  function toggle(node) {
    const media = node.querySelector('video');
    if (!media || node.dataset.id !== activeId || node.classList.contains('is-leaving')) return;
    if (media.paused) {
      node.classList.remove('is-paused');
      media.play().catch(() => {});
    } else {
      media.pause();
      node.classList.add('is-paused');
    }
  }

  function setSound(on, { remember = true } = {}) {
    sound = on;
    if (remember) soundStore.set(on);
    el.classList.toggle('is-muted', !on);
    el.querySelectorAll('video').forEach((media) => { media.muted = !on; });
    el.querySelectorAll('[data-feed="sound"]').forEach((b) => b.setAttribute('aria-label', on ? 'Tắt tiếng' : 'Bật tiếng'));
  }

  // A sheet over the feed pauses the video under it; closing the sheet plays it again unless she paused it.
  function hold(on) {
    held = on;
    const node = itemOf(activeId);
    const media = node?.querySelector('video');
    // The video that is leaving stays paused; the one that comes up plays by itself.
    if (!media || node.classList.contains('is-leaving')) return;
    if (on) media.pause();
    else if (!node.classList.contains('is-paused') && !document.hidden) media.play().catch(() => {});
  }

  function onVisibility() {
    const node = itemOf(activeId);
    const media = node?.querySelector('video');
    if (!media || node.classList.contains('is-leaving')) return;
    if (document.hidden) media.pause();
    else if (!held && !node.classList.contains('is-paused')) media.play().catch(() => {});
  }

  /* ---------- Moving ---------- */

  function step(dir) {
    const all = items();
    let at = all.findIndex((n) => n.dataset.id === activeId);
    const here = itemOf(activeId);
    if (at < 0 && here) {
      // The active video is leaving: it keeps its place, so Down takes the live one after it and Up the one before it.
      const before = all.filter((n) => here.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING).length;
      at = dir > 0 ? before - 1 : before;
    }
    const next = all[at + dir];
    if (next) el.scrollTo({ top: next.offsetTop, behavior: calm() ? 'auto' : 'smooth' });
  }

  function paintNav() {
    const all = items();
    const at = all.findIndex((n) => n.dataset.id === activeId);
    const [up, down] = el.querySelectorAll('.ttf-nav button');
    up.disabled = at <= 0;
    down.disabled = at < 0 || at >= all.length - 1;
  }

  // On a computer, as on tiktok.com: the arrow keys move one video and Space pauses. A sheet over the feed keeps them.
  function onKey(event) {
    if (dead || typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if ([...document.querySelectorAll('dialog[open]')].some((d) => !d.contains(el))) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      step(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === ' ' && !event.target.closest?.('button, a')) {
      event.preventDefault();
      const node = itemOf(activeId);
      if (node) toggle(node);
    }
  }

  // A caption longer than two lines ends with "thêm", which opens the rest.
  function markMore() {
    el.querySelectorAll('.ttf-cap:not(.is-open)').forEach((cap) => {
      const has = cap.nextElementSibling?.matches('.ttf-more');
      if (cap.scrollHeight > cap.clientHeight + 1 && !has) cap.insertAdjacentHTML('afterend', '<button type="button" class="ttf-more" data-feed="more">thêm</button>');
    });
  }

  /* ---------- Leaving ---------- */

  // A video she posted or skipped leaves the feed; the one under it slides up and plays.
  function remove(id) {
    const node = itemOf(id);
    if (!node || dead || node.classList.contains('is-leaving')) return;
    const nextId = afterLeave(items().map((n) => n.dataset.id), id, activeId);
    const media = node.querySelector('video');
    media?.pause();
    const index = list.findIndex((v) => v.id === id);
    if (index >= 0) list.splice(index, 1);
    const finish = () => {
      if (dead) return;
      observer.unobserve(node);
      if (media) { media.removeAttribute('src'); media.load(); }
      const rest = items().filter((n) => n !== node);
      // The video she is on keeps the screen while it leaves; its own finish moves on. A video to come up must be live.
      // If the wanted one is gone, take the first one after the removed spot, else the last one.
      const wanted = activeId === id ? nextId : activeId;
      const next = (activeId === id ? rest.find((n) => n.dataset.id === wanted) : itemOf(wanted))
        ?? rest.find((n) => node.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) ?? rest[rest.length - 1];
      node.remove();
      if (!next) {
        // Another removal may still be leaving; the last one to finish says the feed is empty.
        if (!emptied && !el.querySelector('.ttf-item.is-leaving')) { emptied = true; onEmpty(); }
        return;
      }
      rest.forEach((n) => { n.querySelector('.ttf-info').innerHTML = info(videoOf(n.dataset.id)); });
      markMore();
      el.scrollTop = next.offsetTop;
      if (activeId === id) {
        // The slide plays only on the video she was watching.
        if (!calm()) {
          next.classList.add('is-entering');
          setTimeout(() => next.classList.remove('is-entering'), 400);
        }
        activeId = null;
        activate(next.dataset.id);
      } else paintNav();
    };
    if (calm()) finish();
    else {
      node.classList.add('is-leaving');
      setTimeout(finish, 260);
    }
  }

  function destroy() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    el.querySelectorAll('video').forEach((media) => { media.pause(); media.removeAttribute('src'); media.load(); });
    el.remove();
  }

  /* ---------- Wiring ---------- */

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) activate(entry.target.dataset.id);
  }, { root: el, threshold: 0.6 });

  el.addEventListener('click', (event) => {
    const control = event.target.closest('button, input, a');
    // Chrome focuses a button on a mouse click, and Space would press it again; Tab keeps the focus.
    if (event.detail > 0 && control?.matches('button')) control.blur();
    const act = control?.dataset.feed;
    if (act === 'up' || act === 'down') { step(act === 'down' ? 1 : -1); return; }
    const node = event.target.closest('.ttf-item');
    if (!node || node.classList.contains('is-leaving')) return;
    if (!control) {
      if (event.target.closest('.ttf-stage')) toggle(node);
      return;
    }
    if (act === 'sound') setSound(!sound);
    else if (act === 'retry') { delete node.dataset.retried; play(node, { fresh: true }); }
    else if (act === 'more') { node.querySelector('.ttf-cap')?.classList.add('is-open'); control.remove(); }
    else if (control.dataset.act) onAct(control.dataset.act, videoOf(node.dataset.id), control);
  });

  // Dragging the line seeks; the drag owns the line until she lets go.
  el.addEventListener('input', (event) => {
    const seek = event.target;
    if (!seek.matches?.('.ttf-seek')) return;
    const media = seek.closest('.ttf-item').querySelector('video');
    seek.dataset.drag = '1';
    seek.style.setProperty('--v', `${seek.value / 10}%`);
    if (media?.duration) media.currentTime = (seek.value / 1000) * media.duration;
  });
  el.addEventListener('change', (event) => {
    if (!event.target.matches?.('.ttf-seek')) return;
    delete event.target.dataset.drag;
    event.target.blur();
  });

  // A failed video gets one fresh link; a second failure shows Thử lại.
  el.addEventListener('error', (event) => {
    const media = event.target;
    if (!(media instanceof HTMLVideoElement) || !media.getAttribute('src')) return;
    const node = media.closest('.ttf-item');
    if (node.dataset.id !== activeId) { media.removeAttribute('src'); media.load(); return; }
    // A file that will not decode stays bad on a fresh link. Chrome reports an expired link (HTTP 403) as
    // SRC_NOT_SUPPORTED, so that error still gets the one fresh signing.
    const bad = media.error?.code === MediaError.MEDIA_ERR_DECODE;
    if (bad || node.dataset.retried) { fail(node); return; }
    node.dataset.retried = '1';
    play(node, { fresh: true });
  }, true);
  // A video that plays has a good link, so a link that expires later gets its one fresh signing again.
  el.addEventListener('playing', (event) => {
    if (event.target instanceof HTMLVideoElement) delete event.target.closest('.ttf-item').dataset.retried;
  }, true);
  el.addEventListener('load', (event) => {
    if (event.target.classList?.contains('ttf-poster')) event.target.classList.add('is-in');
  }, true);

  // The feed starts once it is on the page: the route builds the page before it swaps it in.
  function begin() {
    started = true;
    const node = itemOf(startId) ?? items()[0];
    if (node) el.scrollTop = node.offsetTop;
    items().forEach((n) => observer.observe(n));
    el.querySelectorAll('img.ttf-poster').forEach((img) => { if (img.complete && img.naturalWidth) img.classList.add('is-in'); });
    markMore();
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
  }

  // Every frame: start once on the page, stop once off it, and move the progress line of the video on screen.
  function tick() {
    frame = requestAnimationFrame(tick);
    if (!el.isConnected) {
      // A feed that never reaches the page would loop for ever, so it stops 10 seconds after createFeed.
      if (started || performance.now() - born > 10000) destroy();
      return;
    }
    if (!started) begin();
    const node = itemOf(activeId);
    const media = node?.querySelector('video');
    const seek = node?.querySelector('.ttf-seek');
    if (!media || !seek || seek.dataset.drag || !media.duration) return;
    const value = Math.round((media.currentTime / media.duration) * 1000);
    if (String(value) !== seek.value) {
      seek.value = String(value);
      seek.style.setProperty('--v', `${value / 10}%`);
    }
  }

  host.append(el);
  frame = requestAnimationFrame(tick);
  if (el.isConnected) begin();

  return {
    el,
    get activeId() { return activeId; },
    remove,
    hold,
    destroy,
    paintRail(id) {
      const node = itemOf(id);
      const video = videoOf(id);
      if (node && video) node.querySelector('.ttf-rail').innerHTML = rail(video);
    },
    button: (id, act) => itemOf(id)?.querySelector(`.ttf-btn[data-act="${CSS.escape(act)}"]`) ?? null,
    refreshPosters() {
      el.querySelectorAll('img.ttf-poster:not([src])').forEach((img) => {
        const url = posterOf(videoOf(img.closest('.ttf-item').dataset.id));
        if (url) img.src = url;
      });
    },
  };
}
