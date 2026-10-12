import { loadTikTok, signedTikTokUrls, updateTikTok, clearReadCache } from '../data.js?v=20261012t';
import { splitQueue, nextVideo, canTakeBack, tiktokUrl, positionLabel, deliveryMode, fileName, skipLabels, SKIP_REASONS, KEEP_DAYS,
  needsLink, coverName, showHomeHint, homeSteps } from '../lib/tiktok.js?v=20261012t';
import { vnDate } from '../lib/week.js';
import { esc, toast, icon, copyText } from '../ui.js?v=20261012t';
import { feedbackForm, wireFeedback } from './feedback.js?v=20261012t';
import { createFeed } from './tiktok-feed.js?v=20261012t';

// TikTok space (Nam, 2026-10-09; a TikTok feed since 2026-10-11): finished read-Threads videos wait here until a
// member in Vietnam posts them. Chờ đăng is a feed of the waiting videos with the actions down the side; Đã đăng and
// Đã bỏ qua are cover grids that open the same feed. The page paints from one read, posters fade in when their
// signed links arrive, and the file of the video on screen downloads after 2 s, so Lưu hands it to the phone at once.
const VN = 'Asia/Ho_Chi_Minh';
const vnTime = (at) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN, hour: '2-digit', minute: '2-digit' }).format(new Date(at));
function whenLabel(at) {
  const day = vnDate(new Date(at));
  const diff = Math.round((Date.parse(`${vnDate()}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  if (diff === 0) return `${vnTime(at)} · hôm nay`;
  if (diff === 1) return `${vnTime(at)} · hôm qua`;
  const [, m, d] = day.split('-').map(Number);
  return `${vnTime(at)} · ${d}/${m}`;
}

// Chưa đăng and Dùng lại bring a video back; Chờ đăng then opens on it instead of the oldest.
let startAt = null;
// One download per video for the whole visit: { promise, blob, loaded, total, onProgress }, and its object URL.
const files = new Map();
const blobUrls = new Map();
// Steps she has finished on each video this visit (saved, copied), so a repaint keeps their ticks.
const done = new Map();
const isDone = (id, step) => done.get(id)?.has(step) ?? false;
const markDone = (id, step) => { if (!done.has(id)) done.set(id, new Set()); done.get(id).add(step); };
// Bỏ qua shows once the database has the skip columns (migration tiktok_skip); before that the button would only fail.
let skipReady = false;
const HINT_KEY = 'studio.tiktok.homehint';

const coarse = () => window.matchMedia('(pointer: coarse)').matches;
function mode(blob) {
  let canShareFiles = false;
  try { canShareFiles = Boolean(blob && navigator.canShare?.({ files: [new File([blob], 'v.mp4', { type: 'video/mp4' })] })); } catch { /* old browsers throw */ }
  return deliveryMode({ coarse: coarse(), canShareFiles });
}

// A phone holds only a few videos in memory: the 3 newest finished downloads stay, older ones and their object URLs go.
// A download still running has no blob yet, so it is never dropped.
const KEEP_FILES = 3;
function trimFiles() {
  const finished = [...files].filter(([, entry]) => entry.blob);
  for (const [id] of finished.slice(0, Math.max(0, finished.length - KEEP_FILES))) {
    files.delete(id);
    if (blobUrls.has(id)) { URL.revokeObjectURL(blobUrls.get(id)); blobUrls.delete(id); }
  }
}

// The signal belongs to a download the page started on its own (prefetch), so it can stop when she scrolls on.
function fetchFile(video, url, onProgress, signal) {
  const hit = files.get(video.id);
  if (hit) return hit.promise;
  const entry = { blob: null, loaded: 0, total: video.bytes || 0, onProgress };
  entry.promise = (async () => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`video ${res.status}`);
    entry.total = Number(res.headers.get('content-length')) || entry.total;
    if (!res.body?.getReader) { entry.blob = await res.blob(); trimFiles(); return entry.blob; }
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      entry.loaded += value.length;
      entry.onProgress?.(entry);
    }
    entry.blob = new Blob(chunks, { type: 'video/mp4' });
    trimFiles();
    return entry.blob;
  })();
  entry.promise.catch(() => files.delete(video.id));
  files.set(video.id, entry);
  return entry.promise;
}

/* ---------- Markup ---------- */

// The text over a video: one small line, the title in bold, then whatever the page adds.
const lines = (video, meta, extra = '') => `<p class="ttf-meta">${esc(meta)}</p><p class="ttf-title">${esc(video.title)}</p>${extra}`;

const skipSheet = () => `<dialog class="sheet" id="tt-skip-sheet" aria-labelledby="tt-skip-title">
  <div class="sheet-grip" aria-hidden="true"></div>
  <h2 id="tt-skip-title">Vì sao bỏ video này?</h2>
  <p class="small muted">Video rời hàng chờ và nằm ở mục Đã bỏ qua. Bạn lấy lại được bất cứ lúc nào.</p>
  <div id="tt-skip-form"></div>
</dialog>`;

// After Đã đăng, or from her video in Đã đăng: the link to the post. A text field, because TikTok's share button
// copies words around the link and a url field would refuse them. The heading takes focus, so no keyboard pops up.
const linkSheet = () => `<dialog class="sheet" id="tt-link-sheet" aria-labelledby="tt-link-title">
  <div class="sheet-grip" aria-hidden="true"></div>
  <h2 id="tt-link-title" tabindex="-1" autofocus>Dán link TikTok</h2>
  <p class="small muted">Mở video trên TikTok, bấm Chia sẻ, chọn Sao chép liên kết rồi dán vào đây.</p>
  <form class="tt-link" novalidate>
    <label class="sr-only" for="tt-link-url">Link TikTok</label>
    <input id="tt-link-url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Dán link TikTok của video">
    <div class="row-actions"><button class="btn btn-ink" type="submit">Lưu link</button><button class="btn btn-line" type="button" data-later>Để sau</button></div>
  </form>
</dialog>`;

const viewerDialog = () => `<dialog class="ttv" id="tt-viewer" aria-label="Xem video">
  <button class="ttv-x" type="button" data-close aria-label="Đóng">${icon('close')}</button><div class="ttv-feed" tabindex="-1" autofocus></div>
</dialog>`;

// A phone browser keeps its own bars; Studio opened from the Home Screen is full screen (Nam, 2026-10-11).
function homeHint() {
  let dismissed = false;
  try { dismissed = localStorage.getItem(HINT_KEY) === 'done'; } catch { /* storage blocked: show it */ }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!showHomeHint({ coarse: coarse(), standalone, dismissed })) return '';
  return `<aside class="tt-hint"><p><b>Xem toàn màn hình</b>Thêm Vika studio vào Màn hình chính. ${esc(homeSteps(navigator.userAgent))}</p>
    <button type="button" data-hint>Đã hiểu</button></aside>`;
}

/* ---------- The page ---------- */

// The three pages of the TikTok space: Chờ đăng (`queue`), Đã đăng (`posted`) and Đã bỏ qua (`skipped`).
export async function renderTikTok(main, ctx, section = 'queue') {
  if (!ctx.me.tiktok) {
    main.innerHTML = '<div class="empty" style="margin-top:24px"><h2>Mục này chưa mở cho bạn</h2><p>Nhờ Nam mở mục TikTok nếu bạn cần.</p></div>';
    return;
  }
  const videos = (await loadTikTok()).map((v) => ({ ...v }));
  skipReady = videos.some((v) => 'skipped_at' in v);
  let urls = new Map();
  let feed = null;
  let viewerFeed = null;
  let shownId = null;
  let settled = false;
  let saving = false;
  // The download prefetch has running, { id, controller }, so it can stop when a different video comes on screen.
  let prefetching = null;
  let linkFor = null;
  // The Đã đăng write still in flight for each video, so a link pasted at once waits for it.
  const writes = new Map();
  const find = (id) => videos.find((v) => v.id === id);
  const name = (video) => coverName(video, ctx.team.members);

  main.innerHTML = `<div class="tt-view" id="tt-view"></div>${skipSheet()}${linkSheet()}${viewerDialog()}`;
  const view = main.querySelector('#tt-view');
  const skipDialog = main.querySelector('#tt-skip-sheet');
  const linkDialog = main.querySelector('#tt-link-sheet');
  const viewer = main.querySelector('#tt-viewer');
  // A sheet over a feed pauses the video under it.
  const hold = (on) => { feed?.hold(on); viewerFeed?.hold(on); };

  const posterOf = (video) => (video.file_removed_at ? null : urls.get(video.poster_path) ?? null);
  async function signedVideo(video, fresh = false) {
    const url = (await signedTikTokUrls([video.video_path], 3600, { fresh })).get(video.video_path);
    if (!url) throw new Error('no signed link');
    return url;
  }
  // The feed plays the downloaded file when there is one, otherwise the signed link.
  async function videoUrl(video, { fresh = false } = {}) {
    const blob = files.get(video.id)?.blob;
    if (blob && !fresh) {
      if (!blobUrls.has(video.id)) blobUrls.set(video.id, URL.createObjectURL(blob));
      return blobUrls.get(video.id);
    }
    return signedVideo(video, fresh);
  }

  /* Chờ đăng */

  const queueButtons = (video) => [
    { act: 'save', icon: 'download', label: 'Lưu', done: isDone(video.id, 'save') },
    video.caption && { act: 'copy', icon: 'copy', label: 'Mô tả', done: isDone(video.id, 'copy') },
    skipReady && { act: 'skip', icon: 'flag', label: 'Bỏ qua' },
    { act: 'posted', icon: 'check', label: 'Đã đăng', strong: true },
  ].filter(Boolean);
  // The sound is one line, where TikTok shows a video's sound (Nam, 2026-10-11).
  const queueOverlay = (video, position, total) => lines(video, positionLabel(position, total, video.duration_s),
    `${video.caption ? `<p class="ttf-cap">${esc(video.caption)}</p>` : ''}${video.sound ? `<p class="ttf-music">♫ ${esc(video.sound)}</p>` : ''}`);
  const queueActs = { save: (v) => save(v), copy: (v) => copyCaption(v), skip: (v) => openSkip(v), posted: (v, b) => markPosted(v, b) };

  function paintQueue(waiting) {
    if (!waiting.length) {
      view.innerHTML = '<section class="ttf-empty"><h1>Hết video chờ đăng.</h1><p>Video mới sẽ nằm ở đây khi Nam làm xong.</p></section>';
      return;
    }
    view.innerHTML = homeHint();
    view.querySelector('[data-hint]')?.addEventListener('click', (event) => {
      try { localStorage.setItem(HINT_KEY, 'done'); } catch { /* storage blocked */ }
      event.currentTarget.closest('.tt-hint').remove();
    });
    const start = nextVideo(waiting, startAt);
    startAt = null;
    feed = createFeed(view, {
      videos: waiting, startId: start.id, urlOf: videoUrl, posterOf, buttons: queueButtons, overlay: queueOverlay,
      onAct: (act, video, button) => queueActs[act]?.(video, button),
      onActive: (video) => { shownId = video.id; if (settled) prefetch(video); },
      onEmpty: () => { feed?.destroy(); feed = null; paintQueue([]); },
    });
  }

  /* Đã đăng and Đã bỏ qua: covers that open the same feed */

  const cover = (video) => {
    const url = posterOf(video);
    return `<button type="button" class="tt-cover" data-open="${esc(video.id)}" aria-label="${esc(video.title)}">
      ${video.file_removed_at ? `<span class="tt-cover-title">${esc(video.title)}</span>`
        : `<img alt="" decoding="async" data-poster="${esc(video.poster_path ?? '')}"${url ? ` src="${esc(url)}"` : ''}>`}
      ${needsLink(video, ctx.me.id) ? '<span class="tt-badge">Thêm link</span>' : ''}
      <span class="tt-cover-name">${esc(name(video))}</span></button>`;
  };

  function paintGrid(list) {
    const posted = section === 'posted';
    view.innerHTML = `<section class="tt-grid-page">
      <header class="tt-grid-head"><h1>${posted ? 'Đã đăng' : 'Đã bỏ qua'}</h1>
        <p>${list.length} video. ${posted ? 'Người đăng mở video của mình để dán link TikTok.' : 'Người bỏ video mở nó và bấm Dùng lại để đưa về hàng chờ.'}</p></header>
      ${list.length ? `<ol class="tt-covers">${list.map((v) => `<li>${cover(v)}</li>`).join('')}</ol>`
        : `<p class="tt-grid-empty">${posted ? 'Chưa có video nào. Video đăng xong sẽ nằm ở đây, kèm link TikTok của nó.'
          : 'Chưa có video nào bị bỏ qua. Bấm Bỏ qua trên một video ở mục Chờ đăng để nói vì sao không đăng nó.'}</p>`}
      ${posted ? `<p class="tt-grid-foot">File video được xoá ${KEEP_DAYS} ngày sau khi đăng. Trong ${KEEP_DAYS} ngày đó, người đăng mở video và bấm Chưa đăng để đưa nó về hàng chờ.</p>` : ''}
    </section>`;
    view.querySelectorAll('[data-open]').forEach((button) => { button.onclick = () => openViewer(list, button.dataset.open); });
    fadeIn();
  }

  const postedButtons = (video) => [
    video.post_url && { act: 'open', icon: 'out', label: 'Mở TikTok' },
    needsLink(video, ctx.me.id) && { act: 'link', icon: 'link', label: 'Dán link' },
    canTakeBack(video, ctx.me.id) && { act: 'unpost', icon: 'undo', label: 'Chưa đăng' },
  ].filter(Boolean);
  const skippedButtons = (video) => [video.skipped_by === ctx.me.id && { act: 'unskip', icon: 'undo', label: 'Dùng lại' }].filter(Boolean);
  const postedOverlay = (video) => lines(video, `${name(video)} đăng · ${whenLabel(video.posted_at)}${video.file_removed_at ? ' · đã xoá file' : ''}`);
  const skippedOverlay = (video) => {
    const why = skipLabels(video);
    return lines(video, `${name(video)} bỏ · ${whenLabel(video.skipped_at)}`, why.length ? `<p class="ttf-why">${esc(why.join(' · '))}</p>` : '');
  };
  const viewerActs = {
    open: (v) => window.open(v.post_url, '_blank', 'noopener'),
    link: (v) => openLink(v),
    unpost: (v, b) => takeBack(v, b, { by: 'posted_by', patch: { posted_by: null, posted_at: null, post_url: null } }),
    unskip: (v, b) => takeBack(v, b, { by: 'skipped_by', patch: { skipped_by: null, skipped_at: null, skip_reasons: [], skip_words: null } }),
  };

  // The viewer, as on a TikTok profile: the tab's videos in the same feed, full screen, from the cover she tapped.
  function openViewer(list, id) {
    viewer.showModal();
    const host = viewer.querySelector('.ttv-feed');
    host.innerHTML = '';
    viewerFeed = createFeed(host, {
      videos: list, startId: id, urlOf: videoUrl, posterOf, playable: (v) => !v.file_removed_at,
      buttons: section === 'posted' ? postedButtons : skippedButtons,
      overlay: section === 'posted' ? postedOverlay : skippedOverlay,
      onAct: (act, video, button) => viewerActs[act]?.(video, button),
      onEmpty: () => viewer.close(),
    });
    history.pushState({ ttViewer: true }, '');
  }

  function paint() {
    feed?.destroy();
    feed = null;
    const { waiting, posted, skipped } = splitQueue(videos);
    if (section === 'queue') paintQueue(waiting);
    else paintGrid(section === 'posted' ? posted : skipped);
    // A sheet still open over the page keeps the new feed paused too.
    if (skipDialog.open || linkDialog.open) hold(true);
  }

  // Posters fade in as they arrive; nothing else repaints.
  function fadeIn() {
    view.querySelectorAll('.tt-cover img').forEach((img) => {
      if (img.complete && img.naturalWidth) img.classList.add('is-in');
      else img.addEventListener('load', () => img.classList.add('is-in'), { once: true });
    });
  }
  function fillPosters() {
    view.querySelectorAll('img[data-poster]').forEach((img) => {
      const url = urls.get(img.dataset.poster);
      if (url && img.getAttribute('src') !== url) img.src = url;
    });
    fadeIn();
    feed?.refreshPosters();
    viewerFeed?.refreshPosters();
  }

  /* Lưu: the share sheet on a phone, a download on a computer */

  function saveState(video, label, p = 0) {
    const button = feed?.button(video.id, 'save');
    if (!button) return;
    button.disabled = saving;
    button.classList.toggle('is-loading', saving);
    button.style.setProperty('--p', p);
    button.querySelector('.ttf-lbl').textContent = label;
  }
  const progressFor = (video) => (entry) => {
    if (!saving || !entry.total) return;
    const p = Math.min(99, Math.round((entry.loaded / entry.total) * 100));
    saveState(video, `${p}%`, p);
  };
  const tick = (video, step) => { markDone(video.id, step); feed?.paintRail(video.id); };

  // She scrolled on, so the download of the video she left stops, unless Lưu is waiting on it (it sets onProgress).
  // An aborted download leaves `files` and shows no message.
  function stopPrefetch(keepId) {
    if (!prefetching || prefetching.id === keepId) return;
    if (!files.get(prefetching.id)?.onProgress) prefetching.controller.abort();
    prefetching = null;
  }
  // The file of the video on screen downloads once she has watched it for 2 s, unless the phone asks to save data.
  function prefetch(video) {
    if (!video) return;
    stopPrefetch(video.id);
    if (files.has(video.id) || navigator.connection?.saveData) return;
    setTimeout(() => {
      if (shownId !== video.id || files.has(video.id) || prefetching?.id === video.id || !main.isConnected) return;
      const controller = new AbortController();
      prefetching = { id: video.id, controller };
      signedVideo(video).then((url) => fetchFile(video, url, undefined, controller.signal)).catch(() => {})
        .finally(() => { if (prefetching?.controller === controller) prefetching = null; });
    }, 2000);
  }

  async function save(video) {
    if (saving) { toast('Đang tải một video khác. Đợi xong rồi bấm Lưu lần nữa.'); return; }
    let blob = files.get(video.id)?.blob;
    if (!blob) {
      saving = true;
      saveState(video, '…');
      try {
        // Look for the download after the link arrives: prefetch may have started it meanwhile, and a download Lưu
        // waits on (it has onProgress) is never stopped.
        const url = await signedVideo(video);
        const entry = files.get(video.id);
        if (entry) entry.onProgress = progressFor(video);
        blob = await fetchFile(video, url, progressFor(video));
      } catch {
        toast('Chưa tải được video. Kiểm tra mạng rồi thử lại.');
        return;
      } finally {
        saving = false;
        saveState(video, 'Lưu');
      }
    }
    if (mode(blob) === 'share') {
      try {
        await navigator.share({ files: [new File([blob], fileName(video), { type: 'video/mp4' })] });
        tick(video, 'save');
        toast('Xong. Đăng lên TikTok rồi bấm Đã đăng.');
      } catch (error) {
        // The phone allows sharing only straight after a tap; a slow download uses it up, so ask for one more tap.
        if (error.name === 'NotAllowedError') toast('Video đã sẵn sàng. Bấm Lưu lần nữa.');
        else if (error.name !== 'AbortError') toast('Chưa mở được bảng chia sẻ. Thử lại nhé.');
      }
      return;
    }
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href, download: fileName(video) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    tick(video, 'save');
    toast('Đã tải video về máy.');
  }

  async function copyCaption(video) {
    if (!(await copyText(video.caption))) { toast('Chưa sao chép được mô tả. Thử lại nhé.'); return; }
    tick(video, 'copy');
    toast('Đã sao chép mô tả. Dán vào TikTok khi đăng.');
  }

  /* Đã đăng, the link, Bỏ qua, taking back */

  async function markPosted(video, button) {
    button.disabled = true;
    const before = { posted_by: video.posted_by, posted_at: video.posted_at };
    Object.assign(video, { posted_by: ctx.me.id, posted_at: new Date().toISOString() });
    feed.remove(video.id);
    openLink(video);
    const write = updateTikTok(video.id, { posted_by: ctx.me.id, posted_at: video.posted_at }, { waiting: true });
    writes.set(video.id, write);
    try {
      const row = await write;
      if (row) { Object.assign(video, row); return; }
      // Someone else posted or skipped it first: show the server's state.
      // The sheet may belong to another video by now; close it only when it is this one's.
      if (linkFor === video) linkDialog.close();
      await reload();
      startAt = feed?.activeId ?? null; // the video she is on now still waits
      paint();
      toast('Video này đã có người khác xử lý rồi.');
    } catch {
      Object.assign(video, before);
      if (linkFor === video) linkDialog.close();
      startAt = video.id;
      paint();
      toast('Chưa lưu được. Kiểm tra mạng rồi bấm lại nhé.');
    } finally {
      writes.delete(video.id);
    }
  }

  function openLink(video) {
    linkFor = video;
    const form = linkDialog.querySelector('form');
    form.reset();
    form.querySelector('[type=submit]').disabled = false;
    hold(true);
    linkDialog.showModal();
  }

  async function saveLink(video, form) {
    const input = form.querySelector('input');
    const url = tiktokUrl(input.value);
    if (!url) { toast('Dán link của video trên TikTok nhé.'); input.focus(); return; }
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      // The Đã đăng write must have landed. If it did not, markPosted has closed the sheet and said why.
      const landed = await (writes.get(video.id)?.then(Boolean, () => false) ?? true);
      if (!landed) return;
      const row = await updateTikTok(video.id, { post_url: url }, { mine: ctx.me.id });
      if (!row) throw new Error('not changed');
      Object.assign(video, row);
      linkDialog.close();
      toast('Đã lưu link.');
      viewerFeed?.paintRail(video.id);
      if (section === 'posted') paint();
    } catch {
      button.disabled = false;
      toast('Chưa lưu được link. Thử lại nhé.');
    }
  }

  function openSkip(video) {
    const host = skipDialog.querySelector('#tt-skip-form');
    host.innerHTML = feedbackForm({ submit: 'Bỏ video này', reasons: SKIP_REASONS, cancel: 'Thôi' });
    const form = host.querySelector('form');
    const close = () => skipDialog.close();
    wireFeedback(form, async (payload) => {
      if (!payload.reasons.length && !payload.words) {
        toast('Chọn một lý do hoặc viết vài chữ nhé.');
        form.querySelector('[type=submit]').disabled = false;
        return;
      }
      const patch = { skipped_by: ctx.me.id, skipped_at: new Date().toISOString(), skip_reasons: payload.reasons, skip_words: payload.words || null };
      const row = await updateTikTok(video.id, patch, { waiting: true });
      if (!row) {
        close();
        await reload();
        startAt = feed?.activeId ?? null; // the video she is on now still waits
        paint();
        toast('Video này đã có người khác xử lý rồi.');
        return;
      }
      Object.assign(video, row);
      feed?.remove(video.id);
      close();
      toast('Đã bỏ video. Video tiếp theo đã lên thay.');
    }, close);
    hold(true);
    skipDialog.showModal();
  }

  async function takeBack(video, button, { by, patch }) {
    button.disabled = true;
    try {
      const row = await updateTikTok(video.id, patch, { mine: ctx.me.id, by });
      if (!row) throw new Error('not changed');
      Object.assign(video, row);
      startAt = video.id;
      viewerFeed?.remove(video.id);
      paint();
      toast('Đã đưa video về Chờ đăng.');
    } catch {
      button.disabled = false;
      toast('Chưa đưa về được. Thử lại nhé.');
    }
  }

  async function reload() {
    clearReadCache();
    const fresh = await loadTikTok();
    videos.splice(0, videos.length, ...fresh.map((v) => ({ ...v })));
  }

  /* Wiring that lasts as long as the page */

  linkDialog.querySelector('form').onsubmit = (event) => { event.preventDefault(); saveLink(linkFor, event.currentTarget); };
  linkDialog.querySelector('[data-later]').onclick = () => { linkDialog.close(); toast('Dán link sau: mở video ở mục Đã đăng.'); };
  for (const dialog of [linkDialog, skipDialog]) {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => hold(false));
  }
  viewer.querySelector('[data-close]').onclick = () => viewer.close();
  viewer.addEventListener('close', () => {
    viewerFeed?.destroy();
    viewerFeed = null;
    if (history.state?.ttViewer) history.back();
  });
  // The phone's back gesture closes the viewer instead of leaving the page.
  const onPop = () => {
    if (!main.isConnected) { window.removeEventListener('popstate', onPop); return; }
    if (viewer.open) viewer.close();
  };
  window.addEventListener('popstate', onPop);

  // Poster links come from this visit's cache when it has them, so a return to the tab paints them at once.
  const posterPaths = videos.filter((v) => !v.file_removed_at).map((v) => v.poster_path).filter(Boolean);
  const signing = signedTikTokUrls(posterPaths).catch(() => new Map());
  urls = await Promise.race([signing, new Promise((resolve) => setTimeout(() => resolve(urls), 0))]);
  paint();
  signing.then((got) => {
    urls = got;
    fillPosters();
    // The posters go first; the file of the video on screen follows once the page is idle.
    const run = () => { settled = true; prefetch(find(shownId)); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 300);
  });
}
