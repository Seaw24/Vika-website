import { loadAssignment, loadEvents, loadPosts, recordEvent, loadComments, releaseCard, loadPostedSince } from '../data.js?v=20261113a';
import { issuedLink, postingState, vnDate, skippedIds, nextRead } from '../lib/week.js?v=20261113a';
import { appLink, buildCt, fillTemplate } from '../lib/ct.js';
import { ENGINE_LABEL, PULL_LABEL, isEdited } from '../lib/edits.js';
import { pendingCards } from '../lib/chat.js';
import { esc, copyText, toast, draftStore, icon, cardTags, autoGrow } from '../ui.js?v=20261113a';
import { memberR2, postAccounts, linkCode } from './shared.js';
import { SKIP_REASONS } from '../lib/feedback.js';
import { liveNotes } from '../lib/feed.js?v=20261113a';
import { talkHtml, wireTalk, threads } from './talk.js?v=20261113a';

const THREADS_LIMIT = 500;
const THREADS_URL = 'https://www.threads.com/';
const PARTS = [
  ['op', 'Bài đăng', 'Đăng lên Threads'],
  ['r1', 'Bình luận 1', 'Tự trả lời ngay dưới bài'],
  ['r2', 'Bình luận 2', 'Trả lời tiếp, rồi ghim'],
];
const TABS = [['why', 'Vì sao chọn'], ['src', 'Bài gốc'], ['keep', 'Ý cần giữ']];

// The page renders once. Every action after that updates only the piece it changed, so typing,
// copying and choosing never reload the page or move the reader.
export async function renderCard(main, ctx, assignmentId) {
  const a = await loadAssignment(assignmentId);
  if (!a) {
    main.innerHTML = `<a class="linkish" href="#/">${icon('left')}Kho bài</a><div class="empty" style="margin-top:16px"><h2>Không tìm thấy bài này</h2><p>Bài có thể đã được đổi tuần.</p></div>`;
    return;
  }
  const mine = a.member_id === ctx.me.id && !a.released_at;
  // A Insights note written from this page carries the card (views/jot.js); main.js clears it on the next page.
  ctx.jotCard = { id: a.card.id, op: a.card.op };
  const [events, posts, notes, today] = await Promise.all([loadEvents([a.id]), loadPosts([a.id]), loadComments([a.card.id]),
    mine ? loadPostedSince(a.member_id, new Date(`${vnDate()}T00:00:00+07:00`).toISOString()).catch(() => []) : []]);
  threads.set(a.card.id, liveNotes(notes));
  const view = {
    main,
    ctx,
    a,
    card: a.card,
    // A card released to the shared pool (migration card_pool) is nobody's until a member takes it again.
    released: Boolean(a.released_at),
    mine,
    cardAccounts: ctx.team.accounts.filter((x) => x.member_id === a.member_id && x.kind === 'card'),
    events,
    post: posts[0] ?? null,
    tab: 'why',
    answered: new Set(events.filter((e) => e.type === 'answered' && ['edit', 'chat'].includes(e.payload?.kind)).map((e) => e.payload.part)),
  };
  // Her Bình luận 2 text is hers, one for every seeding account (Nam, 2026-09-27); its link carries the code of the
  // account she posts on (Nam, 2026-11-04), which she picks above Bình luận 2.
  view.r2 = memberR2(ctx, a.member_id);
  view.home = view.r2?.account ?? null;
  view.accounts = postAccounts(ctx, a.member_id);
  view.linkAccount = startAccount(view, today);
  ctx.onLeave = () => askLeave(view);
  paint(view);
}

// The account a card starts on: where it was posted, else her last pick on this card, else the account its link was
// made for, else the account with the fewest posted taps today (the oldest on a tie), so her posts spread over her
// accounts.
const PICK_KEY = 'studio.cardAccount.';
function startAccount(view, today) {
  const find = (id) => view.accounts.find((x) => x.id === id) ?? null;
  if (view.post) return view.ctx.team.accounts.find((x) => x.id === view.post.account_id) ?? null;
  let kept = null;
  try { kept = localStorage.getItem(PICK_KEY + view.a.id); } catch { /* storage blocked */ }
  const chosen = find(kept) ?? find(issuedLink(view.events, view.a.id)?.account_id);
  if (chosen) return chosen;
  const last = new Map();
  for (const e of today) if (e.assignment_id !== view.a.id) last.set(e.assignment_id, e);
  const used = new Map();
  for (const e of last.values()) if (e.type === 'posted' && e.account_id) used.set(e.account_id, (used.get(e.account_id) ?? 0) + 1);
  return [...view.accounts].sort((x, y) => (used.get(x.id) ?? 0) - (used.get(y.id) ?? 0))[0] ?? view.home;
}

// The card's link: the posted one, else the one already issued for the chosen account, else a new one from that
// account's code. A link issued before codes were per account carries her first account, so it stays on that account.
function ctOf(view) {
  if (view.post?.ct) return view.post.ct;
  const issued = issuedLink(view.events, view.a.id);
  const account = view.linkAccount;
  if (issued && (!account || issued.account_id === account.id)) return issued.ct;
  return account ? buildCt(linkCode(view.ctx, account), view.card.card_code) : issued?.ct ?? null;
}
const postedOn = (view) => view.post ? view.ctx.team.accounts.find((x) => x.id === view.post.account_id) ?? null : null;
// The member's own word: "posted" (claimed) until the daily read confirms it, or "missing" when that read found nothing.
const claim = (view) => postingState(view.events, view.post ? [view.post] : []).get(view.a.id) ?? null;
const isClaimed = (view) => claim(view)?.status === 'claimed';
const VN = 'Asia/Ho_Chi_Minh';
const vnTime = (at) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN, hour: '2-digit', minute: '2-digit' }).format(new Date(at));
const whenPosted = (at) => `${vnTime(at)}${vnDate(new Date(at)) === vnDate() ? ' hôm nay' : ` ngày ${vnDate(new Date(at)).split('-').reverse().slice(0, 2).map(Number).join('/')}`}`;

function originals(view) {
  const account = view.linkAccount;
  const ct = ctOf(view);
  const r2 = account && ct ? fillTemplate(view.r2.r2_template, appLink(ct)) : null;
  return { op: view.card.op, r1: view.card.r1, r2, account };
}

const draftKey = (view, part, account) => `${view.a.id}.${part}${part === 'r2' && account ? `.${account.id}` : ''}`;
// Bình luận 2 counts as copied only with the link it carries now: after she switches account, she copies it again.
const copiedParts = (view) => {
  const ct = ctOf(view);
  return new Set(view.events.filter((e) => e.type === 'copied' && (e.payload?.part !== 'r2' || !e.payload.ct || e.payload.ct === ct))
    .map((e) => e.payload?.part));
};
const textOf = (view, part, o) => draftStore.get(draftKey(view, part, o.account)) ?? o[part];
const lastEdit = (view, part) => view.events.filter((e) => e.type === 'edited' && e.payload?.part === part).at(-1) ?? null;
const base = (view) => ({ assignment_id: view.a.id, card_id: view.card.id, account_id: view.post?.account_id ?? view.linkAccount?.id ?? view.home?.id ?? null });
const q = (view, sel) => view.root.querySelector(sel);

// The next thing to do: the first part not yet copied.
function nextStep(view, o, copied) {
  if (isClaimed(view)) return null;
  for (const [part] of PARTS) {
    if (copied.has(part)) continue;
    if (part === 'r2' && o.r2 === null) return null;
    return part;
  }
  return null;
}

/* ---------- Markup ---------- */

const countText = (text) => `${[...text].length}/${THREADS_LIMIT}`;
const copyLabel = (done) => done ? `${icon('check')}Đã sao chép` : `${icon('copy')}Sao chép`;

function stateHtml(view, part, edited) {
  if (!edited) return '';
  const said = view.answered.has(part) ? '<span class="said">· đã gửi lý do</span>' : '';
  return `<span class="edited">Đã sửa<button type="button" data-restore="${part}">Về bản gốc</button>${said}</span>`;
}

function partBlock(view, [part, label, where], i, o) {
  const head = `<div class="part-head"><span class="label"><b>${esc(label)}</b><span class="where">${esc(where)}</span></span>`;
  if (part === 'r2' && o.r2 === null) {
    return `<li class="part" id="part-r2" data-i="${i}"><span class="step">${i + 1}</span><div class="part-card">${head}</div>
      <p class="part-empty">Bình luận 2 hiện khi thành viên có tài khoản đăng bài trong Cài đặt.</p></div></li>`;
  }
  const text = textOf(view, part, o);
  return `<li class="part" id="part-${part}" data-i="${i}">
    <span class="step">${i + 1}</span>
    <div class="part-card">
      ${head}<span class="count${[...text].length > THREADS_LIMIT ? ' over' : ''}" data-count="${part}">${countText(text)}</span></div>
      ${part === 'r2' ? accountPick(view) : ''}
      <textarea rows="1" aria-label="${esc(label)}" data-edit="${part}" spellcheck="false"${view.mine ? '' : ' readonly'}>${esc(text)}</textarea>
      <div class="part-foot"><span class="state" data-state="${part}">${stateHtml(view, part, isEdited(o[part], text))}</span>
        <button class="btn copy btn-line" data-copy="${part}">${copyLabel(false)}</button></div>
      ${part === 'op' && view.card.runner_up_op ? `<details class="alt"><summary>Có bản thay thế cho bài đăng<span class="plus"></span></summary>
        <p class="plain">${esc(view.card.runner_up_op)}</p>
        <button class="btn sm btn-line" data-copy-alt style="margin-bottom:12px">${icon('copy')}Sao chép bản thay thế</button></details>` : ''}
    </div></li>`;
}

// The account she posts on, picked above Bình luận 2 because its link carries that account's code. Fixed once she
// marked the card posted or the read found it; a single account needs no pick.
function accountPick(view) {
  const on = view.linkAccount;
  if (!on) return '';
  if (view.post || isClaimed(view) || !view.mine || view.accounts.length < 2) {
    return `<p class="acct-on">${icon('link')}<span>Link của <b>@${esc(on.handle)}</b>${view.post ? '' : ' · đăng bài trên tài khoản này'}</span></p>`;
  }
  return `<div class="acct-pick" role="radiogroup" aria-label="Đăng trên tài khoản nào"><span class="acct-pick-l">Đăng trên</span>
    ${view.accounts.map((x) => `<button type="button" role="radio" aria-checked="${x.id === on.id}" data-acct="${esc(x.id)}">@${esc(x.handle)}</button>`).join('')}</div>`;
}

// Where the card stands. The daily read finds the post on any of her accounts.
function pickBlock(view) {
  const k = claim(view);
  if (view.post) {
    return `<section class="pick" id="pick"><div class="posted-banner">${icon('check')}<span>Đã đăng trên <b>@${esc(postedOn(view)?.handle ?? '')}</b>. Lần đọc Threads đã xác nhận bài này.</span></div></section>`;
  }
  if (view.released) {
    return `<section class="pick" id="pick"><p class="notice">${icon('info')}<span>Bài này đã về kho chung. Muốn đăng thì lấy lại trong kho, nếu chưa bạn nào lấy.</span></p></section>`;
  }
  if (!view.mine) {
    return `<section class="pick" id="pick"><p class="notice">${icon('info')}<span>Bài của thành viên khác. Bạn xem và sao chép được, nhưng không đánh dấu đã đăng.</span></p></section>`;
  }
  if (k?.status === 'claimed') {
    return `<section class="pick" id="pick"><div class="claim-banner">${icon('check')}<span class="grow"><b>Đã đăng</b> lúc ${esc(whenPosted(k.posted_at))}.
      <small>Máy đọc Threads tìm bài trên các tài khoản của bạn lúc ${nextRead()}. Bạn vẫn sửa được bên dưới cho đến lúc đó.</small></span>
      <button class="linkish" data-unpost>${icon('undo')}Chưa đăng, bỏ đánh dấu</button></div></section>`;
  }
  const missing = k?.status === 'missing';
  return `<section class="pick" id="pick">${missing ? `<p class="notice warn">${icon('info')}<span>Lần đọc Threads chưa thấy bài này trên tài khoản nào của bạn sau khi bạn đánh dấu đã đăng. Kiểm tra link ở bình luận 2, rồi bấm Đã đăng xong khi bài đã lên.</span></p>` : ''}
    <div class="pick-foot"><span class="tiny muted">Đăng trên tài khoản đã chọn ở Bình luận 2. Máy đọc Threads tự tìm bài.</span><span class="pick-acts"><button class="linkish" data-release>${icon('bookmark')}Bỏ giữ bài này</button><button class="linkish strong" data-posted>${icon('check')}Đã đăng xong</button></span></div></section>`;
}

function introHtml(view) {
  const k = claim(view);
  const [h, p] = view.post ? ['Bài đã đăng.', 'Nội dung bên dưới là bản viết sẵn.']
    : k?.status === 'claimed' ? ['Đã đăng, chờ xác nhận.', 'Máy đọc Threads sẽ tìm bài này trên các tài khoản của bạn và bắt đầu đếm số liệu.']
    : ['Đăng bài này', 'Chọn tài khoản ở Bình luận 2, rồi sao chép từng phần theo thứ tự và dán vào Threads trên tài khoản đó. Sửa thẳng trong khung nếu cần.'];
  return `<h1>${h}</h1><p class="muted" style="margin-top:8px">${p}</p>`;
}

function dockInner(view, next) {
  const label = PARTS.find(([p]) => p === next)?.[1];
  const act = view.post ? `<span class="done-msg">${icon('check')}<span>Bài đã đăng</span></span>`
    : isClaimed(view) ? `<span class="done-msg">${icon('check')}<span>Đã đăng · chờ xác nhận</span></span>`
    : view.released ? '<span class="done-msg"><span>Bài đã về kho chung</span></span>'
    : !view.mine ? '<span class="done-msg"><span>Bài của thành viên khác</span></span>'
    : next
    ? `<button class="btn btn-gold main-act" data-dock="${next}">${icon('copy')}<span>Sao chép ${esc(label.toLowerCase())}</span></button>`
    : `<button class="btn btn-gold main-act" data-dock="posted">${icon('check')}<span>Đã đăng xong</span></button>`;
  return `<a class="icon-btn" href="#/" aria-label="Về Kho bài">${icon('left')}</a>${act}
    <a class="icon-btn" href="${THREADS_URL}" target="_blank" rel="noopener noreferrer" aria-label="Mở Threads">${icon('out')}</a>`;
}

function tabPanel(view) {
  const card = view.card;
  const n = (v) => new Intl.NumberFormat('vi-VN').format(v);
  const stats = [[card.source_likes, 'lượt thích'], [card.source_replies, 'trả lời'], [card.source_views, 'lượt xem']].filter(([v]) => v != null);
  if (view.tab === 'src') {
    return `<p class="quote">${esc(card.source_original)}</p>
      ${card.source_gloss_vi ? `<p class="small muted" style="margin-top:14px"><b style="color:var(--ink);font-weight:500">Dịch sát:</b> ${esc(card.source_gloss_vi)}</p>` : ''}
      ${stats.length ? `<div class="src-stats">${stats.map(([v, l]) => `<div><b>${n(v)}</b><span>${l}</span></div>`).join('')}</div>` : ''}
      ${card.source_url ? `<p style="margin-top:14px"><a class="linkish" href="${esc(card.source_url)}" target="_blank" rel="noopener noreferrer">Mở bài gốc${icon('out')}</a></p>` : ''}`;
  }
  if (view.tab === 'keep') {
    return card.point_vi || card.build_vi
      ? `<p style="font-size:19px;letter-spacing:-.01em;line-height:1.5">${esc(card.point_vi ?? '')}</p>${card.build_vi ? `<p class="muted" style="margin-top:12px">${esc(card.build_vi)}</p>` : ''}`
      : '<p class="muted">Bài này chưa ghi ý cần giữ.</p>';
  }
  return `<dl>${card.reader_vi ? `<dt>Người đọc</dt><dd>${esc(card.reader_vi)}</dd>` : ''}
    ${card.move_vi ? `<dt>Người lạ sẽ làm gì</dt><dd>${esc(card.move_vi)}</dd>` : ''}
    ${card.pull ? `<dt>Dự đoán sức lan</dt><dd>${esc(PULL_LABEL[card.pull].replace('Dự đoán: ', '').replace(/^./, (c) => c.toUpperCase()))}</dd>` : ''}
    ${card.engine ? `<dt>Cách kéo tương tác</dt><dd>${esc(ENGINE_LABEL[card.engine])}</dd>` : ''}</dl>`;
}

// Không dùng bài này (Nam, 2026-09-28) is gone since the pool became a feed (Nam, 2026-10-27): a card she does not want
// gets a note in Góp ý nội dung, or goes back with Trả về kho chung. A card she set aside before keeps its Dùng lại.
const setAside = (view) => skippedIds(view.events).has(view.a.id);
const reasonLabels = (e) => (e?.payload?.reasons ?? []).map((r) => SKIP_REASONS.find(([code]) => code === r)?.[1]).filter(Boolean);

function flagCard(view) {
  if (['claimed', 'confirmed'].includes(claim(view)?.status) || !setAside(view)) return '';
  const last = view.events.filter((e) => e.type === 'skipped').at(-1);
  const why = [...reasonLabels(last), last?.payload?.words].filter(Boolean);
  return `<section class="flag-card" id="flag">
    <div class="flag-head"><span class="flag-ic">${icon('check')}</span>
      <div><h3>Bạn đã bỏ bài này</h3><p>Bài nằm ở mục Bạn đã bỏ qua trong Kho bài.${why.length ? ` Lý do: ${esc(why.join(' · '))}.` : ''}</p></div></div>
    <div><button class="btn btn-ink" data-take-back>${icon('undo')}Dùng lại</button></div></section>`;
}

function paint(view) {
  const o = originals(view);
  view.main.innerHTML = `<div class="post-layout"><div class="post-main">
      <div class="post-top"><a class="linkish" href="#/">${icon('left')}Kho bài</a><span class="tags">${cardTags(view.card)}</span></div>
      <div class="post-intro">${introHtml(view)}</div>
      ${pickBlock(view)}
      <ol class="thread">${PARTS.map((p, i) => partBlock(view, p, i, o)).join('')}</ol>
      <div class="dock" role="region" aria-label="Bước tiếp theo"></div></div>
    <aside class="post-aside"><section class="backstage"><p class="eyebrow">Hậu trường</p>
      <div class="seg" role="tablist" aria-label="Thông tin về bài">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${view.tab === k}" aria-selected="${view.tab === k}">${l}</button>`).join('')}</div>
      <div class="panel bs-panel" role="tabpanel" data-tab-panel>${tabPanel(view)}</div></section>
      ${view.mine ? flagCard(view) : ''}
      ${talkHtml(view.ctx, view.card, threads.get(view.card.id) ?? [], { place: 'card' })}</aside></div>`;
  view.root = view.main.querySelector('.post-layout');
  view.root.querySelectorAll('[data-edit]').forEach(autoGrow);
  wire(view);
  sync(view);
}

/* ---------- In-place updates ---------- */

// Step states, copy buttons and the dock follow the events; nothing else is touched.
function sync(view) {
  const o = originals(view);
  const copied = copiedParts(view);
  const next = nextStep(view, o, copied);
  for (const [part] of PARTS) {
    const li = q(view, `#part-${part}`);
    if (!li) continue;
    const done = copied.has(part);
    li.classList.toggle('done', done);
    li.classList.toggle('next', next === part);
    li.querySelector('.step').innerHTML = done ? icon('check') : String(Number(li.dataset.i) + 1);
    const btn = li.querySelector('[data-copy]');
    if (btn) {
      btn.className = `btn copy ${done ? 'is-copied' : next === part ? 'btn-gold' : 'btn-line'}`;
      btn.innerHTML = copyLabel(done);
    }
  }
  const alt = q(view, '[data-copy-alt]');
  if (alt && copied.has('runner_up')) { alt.className = 'btn sm is-copied btn-ok'; alt.innerHTML = `${icon('check')}Đã sao chép bản thay thế`; }
  q(view, '.dock').innerHTML = dockInner(view, next);
}

function setState(view, part, text) {
  const edited = isEdited(originals(view)[part], text);
  q(view, `[data-state="${part}"]`).innerHTML = stateHtml(view, part, edited);
  return edited;
}

function onEdit(view, area) {
  const part = area.dataset.edit;
  const o = originals(view);
  draftStore.set(draftKey(view, part, o.account), area.value);
  const count = q(view, `[data-count="${part}"]`);
  count.textContent = countText(area.value);
  count.classList.toggle('over', [...area.value].length > THREADS_LIMIT);
  setState(view, part, area.value);
}

function restore(view, part) {
  const o = originals(view);
  draftStore.drop(draftKey(view, part, o.account));
  const area = q(view, `[data-edit="${part}"]`);
  area.value = o[part];
  area.dispatchEvent(new Event('input', { bubbles: true }));
  toast('Đã về bản viết sẵn.');
}

// The member's word that the post is up; the daily read confirms later. Returns true when a feedback chat waits for
// the card she edited, which opens on Hôm nay (Nam, 2026-10-12).
async function recordPosted(view) {
  view.events.push(await recordEvent({ ...base(view), type: 'posted', payload: { ct: ctOf(view), from: 'card' } }));
  const own = view.events.map((e) => ({ ...e, member_id: e.member_id ?? view.ctx.me.id }));
  if (!pendingCards({ events: own, questions: [], memberId: view.ctx.me.id }).length) return false;
  try { sessionStorage.setItem('studio.chatFor', view.a.id); } catch { /* storage blocked: the card still waits on Hôm nay */ }
  return true;
}

async function markPosted(view) {
  if (view.post || isClaimed(view) || !view.mine || !view.linkAccount) return;
  if (await recordPosted(view)) {
    toast('Đã ghi: đã đăng. Kể nhanh vì sao bạn sửa nhé.');
    location.hash = '#/';
    return;
  }
  toast('Đã ghi: đã đăng.');
  // Right after a post is when a member has an idea to keep: Insights asks once a day (views/jot.js).
  import('./jot.js?v=20261113a').then((m) => m.nudgeAfterPost(view.ctx, view.card)).catch(() => {});
  afterChoice(view);
  q(view, '#pick')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// A new account gives Bình luận 2 a new link; the copy step opens again until she copies it.
function pickAccount(view, id) {
  const account = view.accounts.find((x) => x.id === id);
  if (!account || account.id === view.linkAccount?.id || view.post || isClaimed(view)) return;
  view.linkAccount = account;
  try { localStorage.setItem(PICK_KEY + view.a.id, account.id); } catch { /* storage blocked */ }
  const li = q(view, '#part-r2');
  const tpl = document.createElement('template');
  tpl.innerHTML = partBlock(view, PARTS[2], 2, originals(view)).trim();
  li.replaceWith(tpl.content.firstElementChild);
  const area = q(view, '[data-edit="r2"]');
  if (area) autoGrow(area);
  q(view, `[data-acct="${CSS.escape(id)}"]`)?.focus();
  sync(view);
}

async function unpost(view) {
  if (view.post || !isClaimed(view)) return;
  view.events.push(await recordEvent({ ...base(view), type: 'posted_undo' }));
  toast('Đã bỏ đánh dấu. Bài lại đang đăng.');
  afterChoice(view);
}

// A posted tap changes only the status block, the intro line and Bình luận 2.
function afterChoice(view) {
  const o = originals(view);
  q(view, '.post-intro').innerHTML = introHtml(view);
  q(view, '#pick').outerHTML = pickBlock(view);
  const li = q(view, '#part-r2');
  const tpl = document.createElement('template');
  tpl.innerHTML = partBlock(view, PARTS[2], 2, o).trim();
  li.replaceWith(tpl.content.firstElementChild);
  const area = q(view, '[data-edit="r2"]');
  if (area) autoGrow(area);
  sync(view);
}

async function copyPart(view, part) {
  const area = q(view, `[data-edit="${part}"]`);
  const text = area.value;
  if (!(await copyText(text))) {
    toast('Chưa sao chép được. Hãy chọn chữ và sao chép.');
    return;
  }
  toast(`Đã sao chép ${PARTS.find(([p]) => p === part)[1].toLowerCase()}. Dán vào Threads nhé.`);
  if (!view.mine) return;
  const original = originals(view)[part];
  if (isEdited(original, text) && lastEdit(view, part)?.payload?.after !== text) {
    view.events.push(await recordEvent({ ...base(view), type: 'edited', payload: { part, before: original, after: text, where: 'portal' } }));
  }
  // Copying Bình luận 2 is the moment the link leaves the portal, so the copy carries its code.
  view.events.push(await recordEvent({ ...base(view), type: 'copied', payload: { part, text, ...(part === 'r2' ? { ct: ctOf(view) } : {}) } }));
  sync(view);
  // Bring the next part up.
  const next = nextStep(view, originals(view), copiedParts(view));
  const el = next ? q(view, `#part-${next}`) : null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyAlt(view) {
  const text = view.card.runner_up_op;
  if (!(await copyText(text))) {
    toast('Chưa sao chép được. Hãy chọn chữ và sao chép.');
    return;
  }
  toast('Đã sao chép bản thay thế.');
  if (!view.mine) return;
  view.events.push(await recordEvent({ ...base(view), type: 'used_runner_up', payload: { text } }));
  view.events.push(await recordEvent({ ...base(view), type: 'copied', payload: { part: 'runner_up', text } }));
  sync(view);
}

// Bỏ giữ: the card goes back to the pool for the others, and she picks another in Kho bài.
async function release(view, button) {
  if (!view.mine || view.post || isClaimed(view)) return;
  button.disabled = true;
  try {
    await releaseCard(view.a.id);
    view.released = true;
    toast('Đã bỏ giữ. Bài về kho chung cho cả nhóm.');
    location.hash = '#/';
  } catch (error) { console.error(error); toast('Chưa trả được. Thử lại nhé.'); button.disabled = false; }
}

async function takeBack(view, button) {
  button.disabled = true;
  try {
    view.events.push(await recordEvent({ ...base(view), type: 'skip_undo' }));
    toast('Bài đã về mục Bạn đang giữ.');
    q(view, '#flag').outerHTML = flagCard(view);
  } catch { toast('Chưa lưu được. Thử lại nhé.'); button.disabled = false; }
}

/* ---------- Leaving a card she started ---------- */

// She leaves a card she holds after she copied or changed a part, and has not tapped Đã đăng xong: Studio asks whether
// it went out (Nam, 2026-10-27), because members took card after card and never marked one posted. A card she only
// read leaves without a question.
function started(view) {
  const o = originals(view);
  return copiedParts(view).size > 0 || PARTS.some(([part]) => o[part] != null && isEdited(o[part], textOf(view, part, o)));
}
const mustAsk = (view) => view.mine && !view.post && !isClaimed(view) && !view.released && started(view);

function askLeave(view) {
  if (!mustAsk(view)) return Promise.resolve(true);
  const copied = copiedParts(view).size > 0;
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'sheet leave-sheet';
    dialog.setAttribute('aria-labelledby', 'leave-title');
    dialog.innerHTML = `<div class="sheet-grip"></div>
      <h2 id="leave-title">Bạn đã đăng bài này lên Threads chưa?</h2>
      <p class="muted small">${copied ? 'Bạn đã sao chép bài này' : 'Bạn đã sửa bài này'} nhưng chưa bấm Đã đăng xong.</p>
      <p class="leave-op"><span>${esc(view.card.op)}</span></p>
      <div class="leave-acts">
        <button type="button" class="btn btn-gold" data-leave="posted">${icon('check')}Đã đăng xong</button>
        <button type="button" class="btn btn-line" data-leave="keep">Chưa đăng, giữ bài này</button>
        <button type="button" class="btn btn-line" data-leave="release">Không đăng, bỏ giữ bài này</button>
        <button type="button" class="linkish" data-leave="stay">${icon('left')}Ở lại bài này</button>
      </div>`;
    document.body.append(dialog);
    let done = false;
    async function finish(choice) {
      if (done) return;
      done = true;
      dialog.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      let go = choice !== 'stay';
      try {
        if (choice === 'posted') toast(await recordPosted(view) ? 'Đã ghi: đã đăng. Kể nhanh vì sao bạn sửa nhé.' : 'Đã ghi: đã đăng.');
        else if (choice === 'release') { await releaseCard(view.a.id); view.released = true; toast('Đã bỏ giữ. Bài về kho chung cho cả nhóm.'); }
        else if (choice === 'keep') toast('Bài vẫn ở mục Bạn đang giữ.');
      } catch (error) { console.error(error); toast('Chưa lưu được. Thử lại nhé.'); go = false; }
      dialog.close();
      dialog.remove();
      resolve(go);
    }
    dialog.addEventListener('click', (e) => { const b = e.target.closest('[data-leave]'); if (b) finish(b.dataset.leave); });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish('stay'); });
    dialog.showModal();
  });
}

/* ---------- One set of listeners for the whole page ---------- */

function wire(view) {
  const { root } = view;
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-edit]')) onEdit(view, e.target);
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    const d = b.dataset;
    if ('posted' in d || d.dock === 'posted') markPosted(view);
    else if ('unpost' in d) unpost(view);
    else if (d.copy) copyPart(view, d.copy);
    else if ('copyAlt' in d) copyAlt(view);
    else if (d.dock) copyPart(view, d.dock);
    else if (d.restore) restore(view, d.restore);
    else if (d.acct) pickAccount(view, d.acct);
    else if (d.tab) {
      view.tab = d.tab;
      root.querySelectorAll('[data-tab]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-selected', String(x === b)); });
      q(view, '[data-tab-panel]').innerHTML = tabPanel(view);
    } else if ('release' in d) release(view, b);
    else if ('takeBack' in d) takeBack(view, b);
  });
  wireTalk(root, view.ctx);
}
