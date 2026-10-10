import { loadTikTok, signedTikTokUrls, updateTikTok, clearReadCache } from '../data.js?v=20261009x';
import { splitQueue, nextVideo, canTakeBack, tiktokUrl, durationLabel, sizeLabel, deliveryMode, fileName, skipLabels, SKIP_REASONS, KEEP_DAYS } from '../lib/tiktok.js?v=20261009x';
import { vnDate } from '../lib/week.js';
import { esc, toast, icon, copyText } from '../ui.js?v=20261009x';
import { feedbackForm, wireFeedback } from './feedback.js?v=20261009x';

// TikTok space (Nam, 2026-10-09): finished read-Threads videos wait here until a member in Vietnam posts them.
// The page paints from one read; posters fade in when their signed links arrive, and the next video's file
// downloads in the background, so Lưu video hands it to the phone at once. The video plays in place on its card.
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

let picked = null;
// One download per video for the whole visit: { promise, blob, loaded, total, onProgress }.
const files = new Map();
// Steps she has finished on each video this visit (saved, copied), so a repaint keeps their ticks.
const done = new Map();
const isDone = (id, step) => done.get(id)?.has(step) ?? false;
const markDone = (id, step) => { if (!done.has(id)) done.set(id, new Set()); done.get(id).add(step); };

const coarse = () => window.matchMedia('(pointer: coarse)').matches;
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function mode(blob) {
  let canShareFiles = false;
  try { canShareFiles = Boolean(blob && navigator.canShare?.({ files: [new File([blob], 'v.mp4', { type: 'video/mp4' })] })); } catch { /* old browsers throw */ }
  return deliveryMode({ coarse: coarse(), canShareFiles });
}

function fetchFile(video, url, onProgress) {
  const hit = files.get(video.id);
  if (hit) return hit.promise;
  const entry = { blob: null, loaded: 0, total: video.bytes || 0, onProgress };
  entry.promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`video ${res.status}`);
    entry.total = Number(res.headers.get('content-length')) || entry.total;
    if (!res.body?.getReader) { entry.blob = await res.blob(); return entry.blob; }
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
    return entry.blob;
  })();
  entry.promise.catch(() => files.delete(video.id));
  files.set(video.id, entry);
  return entry.promise;
}

/* ---------- Markup ---------- */

const posterImg = (video, urls) => {
  const url = urls.get(video.poster_path);
  return `<img class="tt-poster" data-poster="${esc(video.poster_path ?? '')}" alt="" decoding="async"${url ? ` src="${esc(url)}"` : ''}>`;
};

const stepNo = (video, step, n) => `<span class="tt-n">${isDone(video.id, step) ? icon('check') : n}</span>`;

// The player is sized like TikTok's: on a computer as tall as the window allows with the steps beside it, as on
// tiktok.com; on a phone edge to edge between the header and the tab bar, with the actions down its right side,
// as in the TikTok app. The whole video always shows (never cropped), on black where the shape differs.
// Bỏ qua shows once the database has the skip columns (migration tiktok_skip); before that the button would only fail.
let skipReady = false;
function rail(video) {
  const btn = (act, ic, label, extra = '') => `<button class="tt-rail-btn" data-act="${act}"${extra}><span class="tt-rail-ic">${icon(ic)}</span><span>${label}</span></button>`;
  return `<div class="tt-rail" aria-label="Thao tác nhanh">
    ${btn('save', isDone(video.id, 'save') ? 'check' : 'download', 'Lưu')}
    ${video.caption ? btn('copy', isDone(video.id, 'copy') ? 'check' : 'copy', 'Mô tả') : ''}
    ${skipReady ? btn('skip', 'flag', 'Bỏ qua') : ''}
    ${btn('posted', 'check', 'Đã đăng', ' data-strong')}
  </div>`;
}

function nextCard(video, urls, position, total, headline) {
  let n = 0;
  const step = (key, body) => `<li class="${isDone(video.id, key) ? 'is-done' : ''}" data-step="${key}">${stepNo(video, key, ++n)}<div class="tt-step">${body}</div></li>`;
  const ready = files.get(video.id)?.blob;
  const steps = [
    step('save', `<button class="btn btn-gold tt-save" data-act="save" style="--p:0">${icon('download')}<span>Lưu video</span></button>
      <p class="tiny tt-note" id="tt-note" aria-live="polite">${ready ? readyNote() : coarse() ? 'Trong bảng chia sẻ, chọn Lưu video, hoặc chọn TikTok để đăng luôn.' : 'Video tải về thư mục Tải xuống.'}</p>`),
    video.caption ? step('copy', `<p class="tt-label">Mô tả</p><p class="tt-caption plain">${esc(video.caption)}</p>
      <button class="btn btn-ghost sm" data-act="copy">${icon(isDone(video.id, 'copy') ? 'check' : 'copy')}<span>${isDone(video.id, 'copy') ? 'Đã sao chép' : 'Sao chép mô tả'}</span></button>`) : '',
    video.sound ? step('sound', `<p class="tt-label">Nhạc</p><p>Trong TikTok, thêm nhạc <b class="gold">${esc(video.sound)}</b>.</p>`) : '',
    step('post', `<p class="tt-label">Đăng xong</p><div class="tt-decide">
      <button class="btn btn-ghost" data-act="posted">${icon('check')}<span>Đã đăng xong</span></button>
      ${skipReady ? `<button class="btn tt-skip" data-act="skip">${icon('flag')}<span>Bỏ qua</span></button>` : ''}</div>`),
  ].join('');
  return `<article class="tt-next" data-video="${esc(video.id)}">
    <div class="tt-player">
      <div class="tt-frame" id="tt-frame">
        ${posterImg(video, urls)}
        <video id="tt-video" playsinline preload="none" controlslist="noremoteplayback" disablepictureinpicture aria-label="Video ${esc(video.title)}"></video>
        <button class="tt-play-btn" data-act="play" aria-label="Xem video">${icon('play')}</button>
        <button class="tt-expand" data-act="expand" aria-label="Phóng to video">${icon('expand')}<span>Phóng to</span></button>
        <span class="tt-chip">${total > 1 ? `${position} / ${total}` : 'Video cuối'}${video.duration_s ? ` · ${esc(durationLabel(video.duration_s))}` : ''}</span>
        ${rail(video)}
      </div>
    </div>
    <div class="tt-body">
      <div class="tt-hero-head"><p class="eyebrow">TikTok · Chờ đăng</p><h1>${headline}</h1></div>
      <p class="tt-pos">${total > 1 ? `Video ${position} / ${total}` : 'Video cuối cùng'}</p>
      <p class="tt-title">${esc(video.title)}</p>
      <p class="tt-meta">${[video.duration_s && `${Math.round(video.duration_s)} giây`, sizeLabel(video.bytes)].filter(Boolean).map(esc).join(' · ')}</p>
      <ol class="tt-steps">${steps}</ol>
    </div>
  </article>`;
}

// Phóng to: only the video, as large as the screen allows, the whole frame showing; Esc or ✕ closes it.
const theater = () => `<dialog class="theater" id="tt-theater" aria-label="Video phóng to">
  <button class="theater-x" data-act="close" aria-label="Đóng">${icon('close')}</button>
  <video playsinline controls controlslist="noremoteplayback" disablepictureinpicture></video>
</dialog>`;

const readyNote = () => (coarse() ? 'Video đã sẵn sàng. Trong bảng chia sẻ, chọn Lưu video hoặc TikTok.' : 'Video đã sẵn sàng.');

const tile = (video, urls, current) => `<li><button class="tt-tile${current ? ' is-current' : ''}" data-pick="${esc(video.id)}" aria-pressed="${current}">
  <span class="tt-thumb">${posterImg(video, urls)}${video.duration_s ? `<span class="tt-dur">${esc(durationLabel(video.duration_s))}</span>` : ''}${current ? '<span class="tt-now">Đang mở</span>' : ''}</span>
  <span class="tt-tile-title">${esc(video.title)}</span></button></li>`;

function postedRow(video, urls, ctx) {
  const who = ctx.team.members.find((m) => m.id === video.posted_by)?.name ?? 'Thành viên';
  const mine = video.posted_by === ctx.me.id;
  const link = video.post_url
    ? `<a class="btn btn-line sm" href="${esc(video.post_url)}" target="_blank" rel="noopener">${icon('out')}Mở trên TikTok</a>`
    // A text field: TikTok's share button copies words around the link, and a url field would refuse them.
    : mine ? `<form class="tt-link" data-link="${esc(video.id)}" novalidate><label class="sr-only" for="tt-url-${esc(video.id)}">Link TikTok</label>
        <input id="tt-url-${esc(video.id)}" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Dán link TikTok của video">
        <button class="btn btn-ink sm" type="submit">Lưu link</button></form>`
    : '<span class="tiny muted">Chưa có link</span>';
  return `<li class="tt-row">
    <span class="tt-row-thumb">${video.file_removed_at ? '' : posterImg(video, urls)}</span>
    <div class="tt-row-body">
      <p class="tt-row-title">${esc(video.title)}</p>
      <p class="tiny muted">${esc(who)} · ${esc(whenLabel(video.posted_at))}${video.file_removed_at ? ' · đã xoá file' : ''}</p>
      <div class="tt-row-acts">${link}${canTakeBack(video, ctx.me.id) ? `<button class="linkish small" data-undo="${esc(video.id)}">${icon('undo')}Chưa đăng</button>` : ''}</div>
    </div></li>`;
}

function skippedRow(video, urls, ctx) {
  const who = ctx.team.members.find((m) => m.id === video.skipped_by)?.name ?? 'Thành viên';
  const why = skipLabels(video);
  return `<li class="tt-row">
    <span class="tt-row-thumb">${posterImg(video, urls)}</span>
    <div class="tt-row-body">
      <p class="tt-row-title">${esc(video.title)}</p>
      <p class="tiny muted">${esc(who)} bỏ · ${esc(whenLabel(video.skipped_at))}</p>
      ${why.length ? `<p class="tt-why small">${esc(why.join(' · '))}</p>` : ''}
      ${video.skipped_by === ctx.me.id ? `<div class="tt-row-acts"><button class="btn btn-line sm" data-unskip="${esc(video.id)}">${icon('undo')}Dùng lại</button></div>` : ''}
    </div></li>`;
}

const skipSheet = () => `<dialog class="sheet" id="tt-skip-sheet" aria-labelledby="tt-skip-title">
  <div class="sheet-grip" aria-hidden="true"></div>
  <h2 id="tt-skip-title">Vì sao bỏ video này?</h2>
  <p class="small muted">Video rời hàng chờ và nằm ở mục Đã bỏ qua. Bạn lấy lại được bất cứ lúc nào.</p>
  <div id="tt-skip-form">${feedbackForm({ submit: 'Bỏ video này', reasons: SKIP_REASONS, cancel: 'Thôi' })}</div>
</dialog>`;

/* ---------- The page ---------- */

// Two tabs of the TikTok space: Chờ đăng (`queue`, the next video and the rest of the queue) and Đã đăng (`posted`).
export async function renderTikTok(main, ctx, section = 'queue') {
  if (!ctx.me.tiktok) {
    main.innerHTML = '<div class="empty" style="margin-top:24px"><h2>Mục này chưa mở cho bạn</h2><p>Nhờ Nam mở mục TikTok nếu bạn cần.</p></div>';
    return;
  }
  const videos = (await loadTikTok()).map((v) => ({ ...v }));
  skipReady = videos.some((v) => 'skipped_at' in v);
  let urls = new Map();
  let shownId = null;
  let settled = false;

  const queuePage = (waiting, posted, skipped, next) => {
    const headline = waiting.length ? `Còn <span class="gold">${waiting.length}&nbsp;video</span> chờ đăng.` : 'Hết video chờ đăng.';
    const lede = waiting.length ? 'Lưu video, đăng lên TikTok, rồi bấm Đã đăng xong. Video tiếp theo lên thay.' : 'Video mới sẽ nằm ở đây khi Nam làm xong.';
    // Her videos posted in the last three days with no link yet stay here, so she adds the link without changing tab.
    const needLink = posted.filter((v) => v.posted_by === ctx.me.id && !v.post_url && canTakeBack(v, ctx.me.id));
    const rest = waiting.filter((v) => v.id !== next?.id);
    return `<section class="stage tt-hero${next ? ' has-video' : ''}">
        ${next ? nextCard(next, urls, waiting.indexOf(next) + 1, waiting.length, headline)
    : `<div class="tt-hero-head"><p class="eyebrow">TikTok · Chờ đăng</p><h1>${headline}</h1><p class="lede">${esc(lede)}</p></div>`}
      </section>
      ${theater()}
      ${needLink.length ? `<section class="section tt-justposted">
        <div class="section-head"><div><p class="eyebrow">Vừa đăng</p><h2 class="section-title">Thêm link TikTok</h2>
          <p class="sub">Mở video trên TikTok, bấm Chia sẻ, chọn Sao chép liên kết rồi dán vào đây.</p></div></div>
        <ol class="tt-list">${needLink.map((v) => postedRow(v, urls, ctx)).join('')}</ol></section>` : ''}
      ${rest.length ? `<section class="section">
        <div class="section-head"><div><p class="eyebrow">Kho video</p><h2 class="section-title">Tiếp theo</h2></div>
          <span class="count">${rest.length} video</span></div>
        <ol class="tt-grid">${rest.map((v) => tile(v, urls, false)).join('')}</ol></section>` : ''}
      ${skipSheet()}`;
  };

  // Đã bỏ qua (Nam, 2026-10-09): its own tab; the team sees who skipped what and why, the skipper can take it back.
  const skippedPage = (skipped) => `<section class="tt-page-head">
      <p class="eyebrow">TikTok · Đã bỏ qua</p>
      <h1 class="section-title">Video đã bỏ qua</h1>
      <p class="sub">${skipped.length} video. Người bỏ video bấm Dùng lại để đưa nó về hàng chờ.</p>
    </section>
    ${skipped.length ? `<ol class="tt-list">${skipped.map((v) => skippedRow(v, urls, ctx)).join('')}</ol>`
    : '<div class="ledger-empty"><p>Chưa có video nào bị bỏ qua. Bấm Bỏ qua trên một video ở mục Chờ đăng để nói vì sao không đăng nó.</p></div>'}`;

  const postedPage = (posted) => `<section class="tt-page-head">
      <p class="eyebrow">TikTok · Đã đăng</p>
      <h1 class="section-title">Video đã lên TikTok</h1>
      <p class="sub">${posted.length} video. Người đăng dán link TikTok vào video của mình.</p>
    </section>
    ${posted.length ? `<ol class="tt-list">${posted.map((v) => postedRow(v, urls, ctx)).join('')}</ol>`
    : '<div class="ledger-empty"><p>Chưa có video nào. Video đăng xong sẽ nằm ở đây, kèm link TikTok của nó.</p></div>'}
    <p class="tiny muted tt-foot">File video được xoá ${KEEP_DAYS} ngày sau khi đăng. Trong ${KEEP_DAYS} ngày đó, người đăng có thể bấm Chưa đăng để đưa video về kho.</p>`;

  const paint = () => {
    const { waiting, posted, skipped } = splitQueue(videos);
    const next = section === 'queue' ? nextVideo(waiting, picked) : null;
    main.innerHTML = section === 'queue' ? queuePage(waiting, posted, skipped, next)
      : section === 'skipped' ? skippedPage(skipped) : postedPage(posted);
    wire(next);
    fadeIn();
  };
  // The next video slides in place of the one she just finished, where the browser can animate the swap.
  const repaint = () => {
    if (!calm() && document.startViewTransition && main.isConnected && document.visibilityState === 'visible') document.startViewTransition(paint);
    else paint();
  };

  // Posters fade in as they arrive; nothing else repaints.
  function fadeIn() {
    main.querySelectorAll('img.tt-poster').forEach((img) => {
      if (img.complete && img.naturalWidth) img.classList.add('is-in');
      else img.addEventListener('load', () => img.classList.add('is-in'), { once: true });
    });
  }
  const fillPosters = () => {
    main.querySelectorAll('img[data-poster]').forEach((img) => {
      const url = urls.get(img.dataset.poster);
      if (url && img.getAttribute('src') !== url) img.src = url;
    });
    fadeIn();
  };

  const note = (text) => { const el = main.querySelector('#tt-note'); if (el) el.textContent = text; };
  // Lưu sits twice, as the first step and on the phone's rail; both show the same state.
  const saveButtons = () => [...main.querySelectorAll('[data-act="save"]')];
  let saving = false;
  function saveState(text, railText, p = null) {
    for (const b of saveButtons()) {
      b.disabled = saving;
      b.classList.toggle('is-loading', saving);
      b.style.setProperty('--p', p ?? 0);
      const label = b.classList.contains('tt-rail-btn') ? b.querySelector('span:last-child') : b.querySelector('span');
      label.textContent = b.classList.contains('tt-rail-btn') ? railText : text;
    }
  }
  const progress = (entry) => {
    if (!saving || !entry.total) return;
    const p = Math.min(99, Math.round((entry.loaded / entry.total) * 100));
    saveState(`Đang tải ${p}%`, `${p}%`, p);
  };
  const tick = (id, step) => {
    markDone(id, step);
    const card = main.querySelector(`[data-video="${id}"]`);
    if (!card) return;
    const li = card.querySelector(`[data-step="${step}"]`);
    if (li) { li.classList.add('is-done'); li.querySelector('.tt-n').innerHTML = icon('check'); }
    const railIcon = card.querySelector(`.tt-rail-btn[data-act="${step}"] .tt-rail-ic`);
    if (railIcon) { railIcon.innerHTML = icon('check'); railIcon.parentElement.classList.add('is-done'); }
  };

  async function videoUrl(video) {
    const url = (await signedTikTokUrls([video.video_path])).get(video.video_path);
    if (!url) throw new Error('no signed link');
    return url;
  }

  // Start the shown video's download once the page is up, unless the phone asks to save data.
  function prefetch(video) {
    if (!video || files.has(video.id) || navigator.connection?.saveData) return;
    videoUrl(video).then((url) => fetchFile(video, url, progress))
      .then(() => { if (shownId === video.id && !saving) note(readyNote()); })
      .catch(() => {});
  }

  async function save(video) {
    let blob = files.get(video.id)?.blob;
    if (!blob) {
      saving = true;
      saveState('Đang tải…', '…');
      try {
        const entry = files.get(video.id);
        if (entry) entry.onProgress = progress;
        blob = await fetchFile(video, await videoUrl(video), progress);
      } catch {
        toast('Chưa tải được video. Kiểm tra mạng rồi thử lại.');
        return;
      } finally {
        saving = false;
        saveState('Lưu video', 'Lưu');
      }
    }
    if (mode(blob) === 'share') {
      try {
        await navigator.share({ files: [new File([blob], fileName(video), { type: 'video/mp4' })] });
        tick(video.id, 'save');
        note('Xong. Đăng lên TikTok rồi bấm Đã đăng xong.');
      } catch (error) {
        // The phone allows sharing only straight after a tap; a slow download uses it up, so ask for one more tap.
        if (error.name === 'NotAllowedError') { note('Video đã sẵn sàng. Bấm Lưu video lần nữa.'); toast('Video đã sẵn sàng. Bấm Lưu lần nữa.'); }
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
    tick(video.id, 'save');
    note('Đã tải video về máy.');
    toast('Đã tải video về máy.');
  }

  async function sourceOf(video) {
    const blob = files.get(video.id)?.blob;
    return blob ? URL.createObjectURL(blob) : videoUrl(video);
  }

  // The video plays where its poster was: the frame keeps its size, so nothing moves. Tapping it pauses or plays.
  async function play(video) {
    const frame = main.querySelector('#tt-frame');
    const el = main.querySelector('#tt-video');
    if (!el.src) {
      try { el.src = await sourceOf(video); } catch { toast('Chưa tải được video.'); return; }
    }
    frame.classList.add('is-playing');
    el.controls = true;
    el.play().catch(() => {});
  }

  // Phóng to: the same video in a dark layer of its own, from where the card's video was, and back.
  async function expand(video) {
    const sheet = main.querySelector('#tt-theater');
    const big = sheet.querySelector('video');
    const small = main.querySelector('#tt-video');
    if (!big.src) {
      const poster = urls.get(video.poster_path);
      if (poster) big.poster = poster;
      try { big.src = small.src || await sourceOf(video); } catch { toast('Chưa tải được video.'); return; }
    }
    big.currentTime = small.currentTime || 0;
    small.pause();
    sheet.showModal();
    big.play().catch(() => {});
    const close = () => sheet.close();
    sheet.querySelector('[data-act="close"]').onclick = close;
    sheet.onclick = (e) => { if (e.target === sheet) close(); };
    sheet.onclose = () => {
      big.pause();
      if (small.src) small.currentTime = big.currentTime;
    };
  }

  async function markPosted(video, btn) {
    btn.disabled = true;
    const before = { posted_by: video.posted_by, posted_at: video.posted_at };
    Object.assign(video, { posted_by: ctx.me.id, posted_at: new Date().toISOString() });
    picked = null;
    repaint();
    toast('Đã đánh dấu đã đăng. Dán link TikTok ở mục Vừa đăng.');
    try {
      const row = await updateTikTok(video.id, { posted_by: ctx.me.id, posted_at: video.posted_at }, { waiting: true });
      if (row) { Object.assign(video, row); return; }
      // Someone else posted or skipped it first: show the server's state.
      await reload();
      toast('Video này đã có người khác xử lý rồi.');
    } catch {
      Object.assign(video, before);
      toast('Chưa lưu được. Kiểm tra mạng rồi bấm lại nhé.');
    }
    repaint();
  }

  async function reload() {
    clearReadCache();
    const fresh = await loadTikTok();
    videos.splice(0, videos.length, ...fresh.map((v) => ({ ...v })));
  }

  function openSkip(video) {
    const sheet = main.querySelector('#tt-skip-sheet');
    const host = sheet.querySelector('#tt-skip-form');
    host.innerHTML = feedbackForm({ submit: 'Bỏ video này', reasons: SKIP_REASONS, cancel: 'Thôi' });
    const form = host.querySelector('form');
    const close = () => sheet.close();
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
        repaint();
        toast('Video này đã có người khác xử lý rồi.');
        return;
      }
      Object.assign(video, row);
      picked = null;
      close();
      repaint();
      toast('Đã bỏ video. Video tiếp theo đã lên thay.');
    }, close);
    sheet.onclick = (e) => { if (e.target === sheet) close(); };
    sheet.showModal();
  }

  async function takeBack(video, btn, { by, patch, done: message }) {
    btn.disabled = true;
    try {
      const row = await updateTikTok(video.id, patch, { mine: ctx.me.id, by });
      if (!row) throw new Error('not changed');
      Object.assign(video, row);
      if (section === 'queue') picked = video.id;
      repaint();
      toast(message);
      if (section === 'queue') window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
    } catch {
      btn.disabled = false;
      toast('Chưa đưa về được. Thử lại nhé.');
    }
  }

  async function saveLink(video, form) {
    const input = form.querySelector('input');
    const url = tiktokUrl(input.value);
    if (!url) { toast('Dán link của video trên TikTok nhé.'); input.focus(); return; }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const row = await updateTikTok(video.id, { post_url: url }, { mine: ctx.me.id });
      if (!row) throw new Error('not changed');
      Object.assign(video, row);
      repaint();
      toast('Đã lưu link.');
    } catch {
      button.disabled = false;
      toast('Chưa lưu được link. Thử lại nhé.');
    }
  }

  const find = (id) => videos.find((v) => v.id === id);
  function wire(next) {
    shownId = next?.id ?? null;
    if (next) {
      const acts = {
        save: () => save(next),
        play: () => play(next),
        expand: () => expand(next),
        posted: (b) => markPosted(next, b),
        skip: () => openSkip(next),
        copy: async () => {
          if (!(await copyText(next.caption))) return;
          const step = main.querySelector('.tt-step [data-act="copy"]');
          if (step) step.innerHTML = `${icon('check')}<span>Đã sao chép</span>`;
          tick(next.id, 'copy');
          toast('Đã sao chép mô tả. Dán vào TikTok khi đăng.');
        },
      };
      main.querySelectorAll('.tt-next [data-act]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); acts[b.dataset.act]?.(b); }; });
      // A double tap or double click on the video opens Phóng to, as on TikTok's site.
      main.querySelector('#tt-frame').ondblclick = (e) => { if (!e.target.closest('[data-act]')) expand(next); };
      const entry = files.get(next.id);
      if (entry && !entry.blob) entry.onProgress = progress;
      // After the first paint settles, whichever video comes up on the card starts downloading.
      if (settled) prefetch(next);
    }
    main.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => {
      picked = b.dataset.pick;
      repaint();
      main.querySelector('.tt-hero')?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
    }; });
    main.querySelectorAll('[data-undo]').forEach((b) => { b.onclick = () => takeBack(find(b.dataset.undo), b,
      { by: 'posted_by', patch: { posted_by: null, posted_at: null, post_url: null }, done: section === 'queue' ? 'Đã đưa video về hàng chờ.' : 'Đã đưa video về mục Chờ đăng.' }); });
    main.querySelectorAll('[data-unskip]').forEach((b) => { b.onclick = () => takeBack(find(b.dataset.unskip), b,
      { by: 'skipped_by', patch: { skipped_by: null, skipped_at: null, skip_reasons: [], skip_words: null }, done: 'Đã đưa video về hàng chờ.' }); });
    main.querySelectorAll('[data-link]').forEach((f) => { f.onsubmit = (e) => { e.preventDefault(); saveLink(find(f.dataset.link), f); }; });
  }

  // Poster links come from this visit's cache when it has them, so a return to the tab paints them at once.
  const posterPaths = videos.filter((v) => !v.file_removed_at).map((v) => v.poster_path).filter(Boolean);
  const signing = signedTikTokUrls(posterPaths).catch(() => new Map());
  urls = await Promise.race([signing, new Promise((resolve) => setTimeout(() => resolve(urls), 0))]);
  paint();
  signing.then((got) => {
    urls = got;
    fillPosters();
    // The posters go first; the shown video's file follows once the page is idle.
    const run = () => { settled = true; prefetch(find(shownId)); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 300);
  });
}
