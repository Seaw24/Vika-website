import { loadMyCards, loadCardHolders, loadCardPosts, loadEvents, loadQuestions, loadLatestObservations, recordEvent, loadMyFeedback, loadCardsBrief, loadPoolPage, takeCard, releaseCard } from '../data.js?v=20261028a';
import { vnDate, mondayOf, addDays, postingState, remaining, postedToday, postedDay, weekStrip, skippedIds, heldIds } from '../lib/week.js';
import { pendingCards, doneChats, LIST_DAYS } from '../lib/chat.js?v=20261028a';
import { PART_LABEL } from '../lib/edits.js';
import { appLink, buildCt, fillTemplate, mintCreativeCode } from '../lib/ct.js';
import { FEED_CHUNK, FEED_FILTERS, HOLD_LIMIT, shortCount, takeMessage } from '../lib/feed.js?v=20261028a';
import { esc, copyText, toast, icon, cardTags, firstLine } from '../ui.js?v=20261028a';
import { settingsFor, isActive, memberR2 } from './shared.js';
import { openChat } from './chat.js?v=20261028a';
import { talkHtml, wireTalk, threads } from './talk.js?v=20261028a';

const DAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const VN = 'Asia/Ho_Chi_Minh';

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d}/${m}`;
}
const shortWeek = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
const vnTime = (at) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN, hour: '2-digit', minute: '2-digit' }).format(new Date(at));
const vnHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: VN, hour: 'numeric', hour12: false }).format(new Date())) % 24;
const num = (v) => new Intl.NumberFormat('vi-VN').format(v);
// Accounts of one member differ by their last part (…a, …b), so that letter marks them.
const mark = (handle) => String(handle).split(/[._]/).filter(Boolean).at(-1)?.charAt(0) ?? '@';
const handleHtml = (account) => `<span class="handle"><i class="av sm">${esc(mark(account.handle))}</i><span>@${esc(account.handle)}</span></span>`;

// "hôm nay", "hôm qua", or the weekday and date, in Vietnam time.
function whenLabel(at, today) {
  const day = vnDate(new Date(at));
  if (day === today) return `${vnTime(at)} · hôm nay`;
  const [y, m, d] = day.split('-').map(Number);
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  return diff === 1 ? `${vnTime(at)} · hôm qua` : `${vnTime(at)} · ${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}/${m}`;
}
// The daily read of Threads runs at 06:00 Vietnam time.
const nextRead = () => (vnHour() < 6 ? '06:00 sáng nay' : '06:00 sáng mai');

/* ---------- Hero: the week strip and the cards she holds ---------- */

// One row per daily slot: that day's first post, second post …
function stripHtml(strip, slots) {
  const head = strip.days.map((d, i) => `<span class="d${d.when === 'today' ? ' today' : ''}">${DAY_SHORT[i]}</span>`).join('');
  const rows = Array.from({ length: slots }, (_, r) => `<span class="who" title="Bài ${r + 1} mỗi ngày">${r + 1}</span>${strip.days.map((d) => {
    const dot = d.dots[r];
    return `<span class="cell ${d.when} ${dot.status}"><i></i></span>`;
  }).join('')}`).join('');
  const label = `Tuần này: ${strip.posted} bài đã đăng${strip.waiting ? `, ${strip.waiting} chờ xác nhận` : ''}`;
  return `<div class="strip" role="img" aria-label="${esc(label)}">
    <div class="strip-grid" style="--rows:${slots}"><span></span>${head}${rows}</div>
    <p class="strip-sum"><b>${strip.posted}</b> bài tuần này${strip.waiting ? ` · <b>${strip.waiting}</b> chờ xác nhận` : ''}<span class="strip-key"><i class="k on"></i>đã xác nhận<i class="k ring"></i>chờ</span></p>
  </div>`;
}

/* ---------- Giữ bài: the bookmark (Nam, 2026-10-27) ---------- */

// She holds at most HOLD_LIMIT cards she has not posted. A held card leaves the pool for the others and stays in her
// feed with its bookmark filled, so the same tap gives it back.
const holdButton = (c, { small = false } = {}) => `<button type="button" class="hold${small ? ' sm' : ''}" data-hold="${esc(c.id)}"${c.held ? ` data-assignment="${esc(c.held)}"` : ''}
  aria-pressed="${Boolean(c.held)}" aria-label="${c.held ? 'Bỏ giữ bài này' : 'Giữ bài này'}">${icon('bookmark')}${small ? '' : `<span>${c.held ? 'Đang giữ' : 'Giữ bài'}</span>`}</button>`;
const actsHtml = (c) => `${c.held ? `<a class="btn btn-ink sm fc-open" href="#/bai/${esc(c.held)}">Đăng bài này${icon('right')}</a>` : ''}${holdButton(c)}`;
const countHtml = (n) => `${icon('bookmark')}<span>Đang giữ <b>${n}/${HOLD_LIMIT}</b></span>`;

// A card she holds and has not posted. She posts it on whichever of her accounts she likes.
function heldTicket(a, s) {
  const href = `#/bai/${esc(a.id)}`;
  return `<article class="ticket is-open">
    <div class="ticket-top"><span class="handle"><span>Đang giữ</span></span>${s?.status === 'missing' ? '<span class="tag warn">Chưa thấy trên Threads</span>' : ''}${holdButton({ id: a.card.id, held: a.id }, { small: true })}</div>
    <a class="ticket-link" href="${href}"><span class="ticket-op">${esc(a.card.op)}</span></a>
    <div class="ticket-foot"><span class="tags">${cardTags(a.card)}</span><span class="acts"><a class="go" href="${href}">Đăng bài này${icon('right')}</a></span></div></article>`;
}

/* ---------- The ledger: this week's posts and where the read of Threads stands ---------- */

function ledgerRow(item, today, observation) {
  const { a, s } = item;
  const account = item.account;
  const at = s.status === 'confirmed' ? (s.posted_at ?? s.published_at) : s.posted_at;
  const dot = s.status === 'confirmed' ? icon('check') : '';
  let foot;
  if (s.status === 'claimed') foot = `<span class="tag gold">Chờ xác nhận</span><span>Máy đọc Threads lúc ${nextRead()}</span>`;
  else foot = `<span class="tag ok">${icon('check')}Đã xác nhận</span>${observation
    ? `<span class="num"><b>${num(observation.views ?? 0)}</b> lượt xem · <b>${num(observation.other_replies ?? observation.replies ?? 0)}</b> trả lời · <b>${num(observation.reposts ?? 0)}</b> đăng lại</span>`
    : '<span>Số liệu có sau lần đọc đầu tiên.</span>'}`;
  return `<li class="led ${s.status}"><span class="led-rail"><i>${dot}</i></span>
    <div class="led-body"><div class="led-top">${account ? handleHtml(account) : ''}<span class="led-when">${esc(whenLabel(at, today))}</span></div>
      <a class="led-op" href="#/bai/${esc(a.id)}">${esc(a.card.op)}</a>
      <div class="led-foot">${foot}</div></div></li>`;
}

const row = (a, i, { note = null, after = '' } = {}) => `<li${after ? ' class="has-action"' : ''}><a class="lib-row${note ? ' is-used' : ''}" href="#/bai/${esc(a.id)}">
  <span class="n">${note ? '•' : String(i + 1).padStart(2, '0')}</span>
  <span><span class="t">${esc(a.card.op)}</span><span class="tags">${note ? `<span class="tag ${note[1]}">${esc(note[0])}</span>` : ''}${cardTags(a.card)}</span></span>
  <span class="arrow">${icon('right')}</span></a>${after}</li>`;

/* ---------- Hint and the self-written post link ---------- */

// The portal sends no reminders, so it asks once to be added to the home screen. It hides for good after
// "Đã hiểu", and never shows inside the home-screen app itself.
const A2HS = 'studio.a2hs';
function homeHint() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let dismissed = false;
  try { dismissed = localStorage.getItem(A2HS) === '1'; } catch { /* storage blocked */ }
  if (standalone || dismissed) return '';
  return `<div class="hint" id="a2hs"><p><b>Mở nhanh hơn từ màn hình chính.</b> iPhone: nút Chia sẻ, chọn "Thêm vào MH chính". Android: ⋮, chọn "Thêm vào màn hình chính".</p>
    <button class="btn sm btn-line" id="a2hs-ok">Đã hiểu</button></div>`;
}

// Every member gets the tile (Nam, 2026-10-26). A creative account keeps its own Bình luận 2 and link code;
// without one, the link takes the Bình luận 2 and code of her card posts, and she posts on any account of hers.
function linkSource(ctx, creative) {
  return creative ? { account: creative, ...settingsFor(ctx, creative) } : memberR2(ctx, ctx.me.id);
}

function creativeBody(creative) {
  return `<p class="small muted">${creative ? `Tài khoản sáng tạo @${esc(creative.handle)}. ` : 'Tài khoản nào cũng được. '}Tạo link cho từng bài mới rồi dán vào bình luận 2, để biết bài nào mang về lượt cài.</p>
    <div class="row-actions"><button class="btn btn-ink sm" id="mint">${icon('link')}Tạo link cho bài mới</button></div>
    <div id="minted"></div>`;
}

async function mint(main, s) {
  const code = mintCreativeCode();
  const ct = buildCt(s.account_code, code);
  const text = fillTemplate(s.r2_template, appLink(ct));
  await recordEvent({ type: 'creative_link', account_id: s.account.id, payload: { ct, code, settings_at: s.created_at } });
  main.querySelector('#minted').innerHTML = `<div class="minted"><p class="eyebrow">Bình luận 2 · link mới</p><p class="plain">${esc(text)}</p>
    <button class="btn btn-ink sm" id="copy-creative">${icon('copy')}Sao chép</button></div>`;
  main.querySelector('#copy-creative').onclick = async (e) => {
    const button = e.currentTarget;
    if (await copyText(text)) {
      button.innerHTML = `${icon('check')}Đã sao chép`;
      toast('Đã sao chép. Dán vào Threads nhé.');
    }
  };
}

/* ---------- Kể lý do sửa: cards she changed and has not explained (docs/plans/2026-10-12-feedback-chat-v2.md) ---------- */

const changedWhat = (entry) => [...new Set(entry.changes.map((c) => `${(PART_LABEL[c.part] ?? c.part).toLowerCase()}${c.source === 'posted' ? ' khi đăng' : ''}`))].join(', ');

// The list stays until each card is explained; closing the chat keeps the card here. A card she just
// posted after editing opens its chat at once (card.js sets studio.chatFor).
async function paintFeedback(main, ctx, questions) {
  const host = main.querySelector('#questions');
  let want = null;
  try { want = sessionStorage.getItem('studio.chatFor'); sessionStorage.removeItem('studio.chatFor'); } catch { /* storage blocked */ }
  const since = new Date(Date.now() - LIST_DAYS * 86400000).toISOString();
  const events = await loadMyFeedback(ctx.me.id, since);
  const list = pendingCards({ events, questions, memberId: ctx.me.id });
  if (!list.length) { host.innerHTML = ''; return; }
  const done = doneChats(events);
  const cards = new Map((await loadCardsBrief([...list, ...done].map((e) => e.card_id).filter(Boolean))).map((c) => [c.id, c]));
  const op = (e) => cards.get(e.card_id)?.op ?? e.changes[0].before;
  host.innerHTML = `<section class="panel sand fb-list" aria-labelledby="fb-title">
    <p class="eyebrow">Kể lý do sửa · còn ${list.length}</p>
    <h2 id="fb-title">${list.length === 1 ? 'Bạn đã sửa một bài' : `Bạn đã sửa ${list.length} bài`}</h2>
    <p class="small muted">Nói nhanh vì sao bạn sửa câu chữ, để bài sau viết đúng hơn. Mỗi bài chừng một phút.</p>
    <ol class="fb-rows">${list.map((e) => `<li><span class="fb-t"><span class="t">${esc(firstLine(op(e), 90))}</span><span class="tiny muted">Đã sửa ${esc(changedWhat(e))}</span></span>
      <button type="button" class="btn sm btn-ink" data-talk="${esc(e.assignment_id)}">Nói về bài này</button></li>`).join('')}</ol></section>`;
  const talk = (entry) => openChat({ entry, card: cards.get(entry.card_id) ?? null, entries: list, cards, done, onSaved: () => paintFeedback(main, ctx, questions) });
  host.querySelectorAll('[data-talk]').forEach((b) => { b.onclick = () => talk(list.find((e) => e.assignment_id === b.dataset.talk)); });
  const asked = want && list.find((e) => e.assignment_id === want);
  if (asked) talk(asked);
}

/* ---------- Her cards: what she holds, this week's posts, the strip ---------- */

async function loadMine(ctx) {
  const today = vnDate();
  const mine = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id);
  // A retired account still names its old posts, but holds no slot and no creative tile.
  const cardAccounts = mine.filter((a) => a.kind === 'card');
  const creative = mine.find((a) => a.kind === 'creative' && isActive(a)) ?? null;
  const seeding = cardAccounts.filter(isActive).length;
  const [assignments, questions] = await Promise.all([loadMyCards(ctx.me.id), loadQuestions(ctx.me.id)]);
  const current = mondayOf(today);
  const ids = assignments.map((a) => a.id);
  const cardIds = [...new Set(assignments.map((a) => a.card.id))];
  const [cardPosts, holders, events] = await Promise.all([
    loadCardPosts(cardIds),
    loadCardHolders(cardIds),
    loadEvents([...new Set([...ids, ...questions.map((q) => q.assignment_id).filter(Boolean)])]),
  ]);
  const posts = cardPosts.filter((p) => ids.includes(p.assignment_id));
  const states = postingState(events, posts);
  const skipped = skippedIds(events);
  const held = heldIds(assignments, holders, cardPosts);
  const available = assignments.filter((a) => held.has(a.id) && !skipped.has(a.id));
  const accountOf = (id) => cardAccounts.find((x) => x.id === id) ?? null;
  // The daily target stays one post per seeding account; which cards and which account are hers to pick.
  const slots = Math.max(1, seeding);
  const ledger = assignments.map((a) => ({ a, s: states.get(a.id) }))
    .filter(({ s }) => s && (s.status === 'claimed' || postedDay(s) >= current))
    .map((it) => ({ ...it, account: it.s.status === 'confirmed' ? accountOf(it.s.account_id) : null }));
  const rank = { claimed: 0, missing: 1, confirmed: 2 };
  const stamp = (s) => Date.parse(s.posted_at ?? s.published_at ?? s.at ?? 0);
  ledger.sort((x, y) => rank[x.s.status] - rank[y.s.status] || stamp(y.s) - stamp(x.s));
  const observations = await loadLatestObservations(ledger.filter(({ s }) => s.status === 'confirmed').map(({ s }) => s.post.id));
  return {
    today, current, seeding, slots, creative, questions, assignments, states, observations,
    linkFrom: linkSource(ctx, creative),
    holding: remaining(available, states).map((a) => ({ a, s: states.get(a.id) })),
    // Cards she copied or edited: one may be up on Threads already, so giving it back asks first.
    started: new Set(events.filter((e) => ['copied', 'edited'].includes(e.type)).map((e) => e.assignment_id)),
    ledger: ledger.filter(({ s }) => s.status !== 'missing'),
    // Cards she set aside before the pool became a feed; Dùng lại makes one hers again.
    elsewhere: assignments.filter((a) => held.has(a.id) && skipped.has(a.id) && !states.has(a.id)),
    strip: weekStrip({ weekId: current, today, slots, states }),
    doneToday: postedToday(assignments, states, today),
  };
}

function topHtml(ctx, m) {
  const waiting = m.ledger.filter(({ s }) => s.status === 'claimed').length;
  const confirmed = m.ledger.filter(({ s }) => s.status === 'confirmed').length;
  const headline = !m.seeding ? 'Thêm một tài khoản seeding để đăng bài.'
    : m.doneToday >= m.slots ? `Hôm nay đã đăng đủ <span class="gold">${m.doneToday}&nbsp;bài</span>. Nghỉ thôi.`
    : m.doneToday ? `Hôm nay đã đăng <span class="gold">${m.doneToday}/${m.slots}&nbsp;bài</span>.`
    : `Hôm nay chọn <span class="gold">${m.slots}&nbsp;bài</span> để đăng.`;
  const lede = !m.seeding ? 'Vào Cài đặt, bấm Thêm tài khoản Threads và chọn Có, seeding. Trước đó bạn vẫn xem và góp ý được mọi bài trong kho chung.'
    : m.doneToday < m.slots ? (m.holding.length
      ? `Mở bài bạn đang giữ để đăng, hoặc giữ thêm trong kho chung, tối đa ${HOLD_LIMIT} bài. Đăng trên tài khoản nào của bạn cũng được.`
      : `Bấm dấu giữ trên bài bạn thích trong kho chung, tối đa ${HOLD_LIMIT} bài, rồi mở bài để đăng. Đăng trên tài khoản nào của bạn cũng được.`)
    : waiting ? `Máy đọc Threads lúc ${nextRead()} sẽ xác nhận bài và bắt đầu đếm số liệu.`
    : 'Bài đã đăng có số liệu sau mỗi lần đọc Threads buổi sáng.';
  return `${ctx.me.is_demo ? `<p class="notice">${icon('info')}<span>Tài khoản mẫu để thử portal. Bài là nội dung đã chuẩn bị; các tên @vika.demo chưa phải tài khoản Threads thật.</span></p>` : ''}
    <section class="stage today-hero pool-hero">
      <div class="hero-grid">
        <div class="hero-lead">
          <p class="eyebrow">${esc(formatDay(m.today))} · Tuần ${esc(shortWeek(m.current))} – ${esc(shortWeek(addDays(m.current, 6)))}</p>
          <h1>${headline}</h1>
          <p class="lede">${esc(lede)}</p>
          <button type="button" class="btn btn-gold sm jump" data-jump>${icon('down')}Xem kho chung</button>
        </div>
        ${stripHtml(m.strip, m.slots)}
      </div>
      ${m.holding.length ? `<div class="holding"><p class="eyebrow">Bạn đang giữ ${m.holding.length}/${HOLD_LIMIT} bài</p><div class="tickets">${m.holding.map(({ a, s }) => heldTicket(a, s)).join('')}</div></div>` : ''}
    </section>
    <div id="questions"></div>
    <div class="today-folds">
      <details class="fold"><summary><span>Đã đăng tuần này <span class="muted">· ${confirmed} đã xác nhận${waiting ? `, ${waiting} chờ` : ''}</span></span><span class="plus"></span></summary>
        <div class="fold-body">${m.ledger.length ? `<ol class="ledger">${m.ledger.map((it) => ledgerRow(it, m.today, it.s.post ? m.observations.get(it.s.post.id) : null)).join('')}</ol>`
          : '<p class="muted small" style="padding:4px 0 10px">Chưa có bài nào tuần này. Bài bạn đăng sẽ nằm ở đây, chờ máy đọc Threads xác nhận lúc 06:00 mỗi sáng.</p>'}</div></details>
      ${m.linkFrom ? `<details class="fold"><summary><span>Bài tự viết <span class="muted">· tạo link tải app</span></span><span class="plus"></span></summary><div class="fold-body">${creativeBody(m.creative)}</div></details>` : ''}
      ${m.elsewhere.length ? `<details class="fold"><summary><span>Bạn đã bỏ qua <span class="muted">· ${m.elsewhere.length}</span></span><span class="plus"></span></summary><div class="fold-body"><ol class="library">${m.elsewhere.map((a, i) => row(a, i, { note: ['Đã bỏ qua', 'line'], after: `<button type="button" class="btn btn-line sm" data-take-back="${esc(a.id)}">Dùng lại</button>` })).join('')}</ol></div></details>` : ''}
    </div>
    ${homeHint()}`;
}

/* ---------- Kho chung: the whole pool as a feed ---------- */

// The feed outlives the page, so a trip to a card and back lands on the same chunks, filter and notes, and main.js
// puts her back where she was. After FRESH_MS the page reads the pool again from the top.
const FRESH_MS = 5 * 60_000;
const feed = { member: null, filter: 'all', cards: [], total: 0, allTotal: 0, done: false, at: 0, token: 0, next: null, mine: null, holdCount: 0, refreshing: null };

// A card keeps what she did to it (c.cut once measured, c.full, c.open, c.showOld), so a feed painted again from
// memory has the same heights and main.js lands her on the same card.
function feedCard(ctx, c, i) {
  const stats = [[shortCount(c.source_likes), 'thích'], [shortCount(c.source_reposts), 'đăng lại']].filter(([v]) => v && v !== '0');
  const cut = c.cut === true && !c.full;
  return `<li class="fc${c.full ? ' is-full' : ''}${c.held ? ' is-held' : ''}" data-card="${esc(c.id)}" style="--i:${i}">
    <article class="fc-post">
      <div class="fc-top"><span class="tags">${cardTags(c)}</span>${c.source_url ? `<a class="fc-src" href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">Bài gốc${stats.length ? ` · ${stats.map(([v, l]) => `${v} ${l}`).join(' · ')}` : ''}${icon('out')}</a>` : ''}</div>
      <div class="fc-text${cut ? ' is-cut' : ''}" data-clamp>
        <p class="fc-op">${esc(c.op)}</p>
        ${c.r1 ? `<div class="fc-r1"><span class="fc-lbl">Bình luận 1</span><p>${esc(c.r1)}</p></div>` : ''}
      </div>
      <button type="button" class="fc-more" data-more${cut ? '' : ' hidden'}>Xem cả bài${icon('down')}</button>
      <div class="fc-foot">
        ${c.like_mine ? `<span class="fc-note">${icon('info')}Giống một bài bạn đã đăng tuần này. Vẫn đăng được, tuỳ bạn.</span>` : '<span></span>'}
        <span class="fc-acts" data-acts>${actsHtml(c)}</span>
      </div>
    </article>
    ${talkHtml(ctx, c, threads.get(c.id) ?? [], { open: c.open, showOld: c.showOld })}
  </li>`;
}

const skeletons = (n = 2) => Array.from({ length: n }, (_, i) => `<div class="fc fc-sk" style="--sk-index:${i}" aria-hidden="true">
  <div class="fc-post"><span class="sk-line" style="--sk-width:30%"></span><span class="sk-line" style="--sk-width:92%"></span><span class="sk-line" style="--sk-width:84%"></span><span class="sk-line" style="--sk-width:58%"></span><span class="sk-pill"></span></div>
  <div class="talk"></div></div>`).join('');

const poolTitle = (n) => `${num(n)} bài trong kho chung`;

// A bottom sheet with a few choices. Resolves with the data-choice she taps, or null when she closes it.
function ask(inner) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'sheet';
    dialog.innerHTML = `<div class="sheet-grip"></div>${inner}`;
    document.body.append(dialog);
    const done = (choice) => { dialog.close(); dialog.remove(); resolve(choice); };
    dialog.addEventListener('click', (e) => { const b = e.target.closest('[data-choice]'); if (b) done(b.dataset.choice); });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    dialog.showModal();
  });
}

function paintCount(main) {
  const el = main.querySelector('[data-hold-count]');
  if (!el) return;
  el.innerHTML = countHtml(feed.holdCount);
  el.classList.toggle('is-full', feed.holdCount >= HOLD_LIMIT);
}

// Her cards again after a hold, an unhold or a return from a card. The top repaints in place only when it changed.
function refreshTop(main, ctx) {
  feed.refreshing = loadMine(ctx).then((fresh) => {
    const before = feed.mine;
    feed.mine = fresh;
    feed.holdCount = fresh.holding.length;
    paintCount(main);
    const top = main.querySelector('#today-top');
    const html = topHtml(ctx, fresh);
    if (!top || (before && html === topHtml(ctx, before))) return;
    top.innerHTML = html;
    wireTop(main, ctx, fresh);
  }).catch((error) => console.error(error));
  return feed.refreshing;
}

function wireFeed(main, ctx, { seeding }) {
  const list = main.querySelector('#feed');
  const end = main.querySelector('#feed-end');
  const title = main.querySelector('#pool-title');
  const count = main.querySelector('#feed-count');
  let busy = false;

  // A card's text opens fully on a tap. Whether it is cut is measured once per card, a whole chunk in one frame.
  const cardOf = (li) => feed.cards.find((c) => c.id === li.dataset.card);
  function measure(lis) {
    const fresh = lis.filter((li) => cardOf(li)?.cut === undefined);
    if (!fresh.length) return;
    requestAnimationFrame(() => {
      const cuts = fresh.map((li) => { const text = li.querySelector('[data-clamp]'); return text.scrollHeight > text.clientHeight + 4; });
      fresh.forEach((li, i) => {
        const card = cardOf(li);
        if (card) card.cut = cuts[i];
        li.querySelector('[data-clamp]').classList.toggle('is-cut', cuts[i]);
        li.querySelector('[data-more]').hidden = !cuts[i];
      });
    });
  }

  // The first chunk loads before the router puts the page on screen; once she has left the page, nothing more loads.
  let shown = false;
  const gone = () => { if (main.isConnected) shown = true; return shown && !main.isConnected; };
  const near = () => main.isConnected && end.getBoundingClientRect().top < window.innerHeight + 1600;
  const pageKey = () => `${feed.filter}:${feed.cards.length}`;
  const fetchNext = () => {
    if (feed.next?.key !== pageKey()) feed.next = { key: pageKey(), promise: loadPoolPage({ offset: feed.cards.length, limit: FEED_CHUNK, filter: feed.filter }) };
    return feed.next.promise;
  };

  function append(cards, { animate = true } = {}) {
    const start = list.children.length;
    list.insertAdjacentHTML('beforeend', cards.map((c, i) => feedCard(ctx, c, animate ? i : 0)).join(''));
    const added = [...list.children].slice(start);
    if (!animate) added.forEach((li) => li.classList.add('no-enter'));
    measure(added);
  }
  function paintEnd() {
    end.innerHTML = feed.done
      ? `<p class="feed-done">${feed.cards.length ? (feed.filter === 'all' ? `Hết kho. Bạn đã xem cả ${num(feed.cards.length)} bài.` : `Hết bài khớp bộ lọc này · ${num(feed.cards.length)} bài.`)
        : feed.filter === 'all' ? 'Kho chung đã hết bài. Admin sẽ thêm bài mới.' : 'Không có bài nào khớp bộ lọc này.'}</p>`
      : skeletons(feed.cards.length ? 1 : 3);
  }

  async function more() {
    if (busy || feed.done || gone()) return;
    busy = true;
    const token = feed.token;
    paintEnd();
    try {
      const page = await fetchNext();
      if (token !== feed.token || gone()) return;
      feed.next = null;
      // Someone may have taken a card since the last chunk, so the offsets move; a card already shown stays once.
      const seen = new Set(feed.cards.map((c) => c.id));
      const fresh = page.cards.filter((c) => !seen.has(c.id));
      for (const c of fresh) threads.set(c.id, c.comments ?? []);
      feed.cards.push(...fresh);
      feed.total = page.total;
      feed.done = page.cards.length < FEED_CHUNK;
      feed.at = Date.now();
      if (feed.filter === 'all') { feed.allTotal = page.total; title.textContent = poolTitle(page.total); }
      count.textContent = feed.filter === 'all' ? '' : `${num(page.total)} bài`;
      append(fresh);
      paintEnd();
      if (!feed.done) fetchNext().catch(() => { feed.next = null; });
    } catch (error) {
      console.error(error);
      feed.next = null;
      end.innerHTML = '<p class="feed-done">Chưa tải được thêm bài. <button type="button" class="linkish strong" data-feed-retry>Thử lại</button></p>';
    } finally {
      if (token === feed.token) busy = false;
    }
    if (near()) more();
  }

  const watch = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) more(); }, { rootMargin: '0px 0px 1600px 0px' });
  watch.observe(end);

  // A card that left the pool folds away where it stood.
  function dropRow(id) {
    feed.cards = feed.cards.filter((c) => c.id !== id);
    const li = list.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (!li) return;
    li.style.height = `${li.offsetHeight}px`;
    requestAnimationFrame(() => li.classList.add('is-leaving'));
    setTimeout(() => li.remove(), 380);
  }

  function setHeld(id, assignmentId) {
    const card = feed.cards.find((c) => c.id === id);
    if (card) card.held = assignmentId;
    const li = list.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (!card || !li) return;
    li.classList.toggle('is-held', Boolean(assignmentId));
    li.querySelector('[data-acts]').innerHTML = actsHtml(card);
  }
  const waiting = (button, on) => { if (!button) return; button.disabled = on; button.classList.toggle('is-busy', on); };

  async function hold(id, button) {
    waiting(button, true);
    button?.setAttribute('aria-pressed', 'true');
    let result;
    try { result = await takeCard(id); } catch (error) { console.error(error); result = { error: 'failed' }; }
    if (result?.assignment_id) {
      feed.holdCount += 1;
      setHeld(id, result.assignment_id);
      paintCount(main);
      toast(feed.holdCount >= HOLD_LIMIT ? `Đã giữ bài. Bạn đang giữ đủ ${HOLD_LIMIT} bài.` : `Đã giữ bài. Bạn đang giữ ${feed.holdCount}/${HOLD_LIMIT} bài.`);
      refreshTop(main, ctx);
      return true;
    }
    waiting(button, false);
    button?.setAttribute('aria-pressed', 'false');
    if (result?.error === 'limit') { await refreshTop(main, ctx); limitSheet(id); return false; }
    toast(takeMessage(result));
    if (result?.error === 'taken') dropRow(id);
    return false;
  }

  async function unhold(id, assignmentId, button) {
    waiting(button, true);
    try { await releaseCard(assignmentId); } catch (error) {
      console.error(error);
      toast('Chưa bỏ giữ được. Thử lại nhé.');
      waiting(button, false);
      return false;
    }
    feed.holdCount = Math.max(0, feed.holdCount - 1);
    setHeld(id, null);
    paintCount(main);
    refreshTop(main, ctx);
    return true;
  }

  // A fourth card: the sheet says the limit plainly and lets her swap one of her three for it in one tap.
  async function limitSheet(id) {
    await feed.refreshing;
    const held = feed.mine?.holding ?? [];
    const choice = await ask(`<h2>Bạn đang giữ đủ ${HOLD_LIMIT} bài</h2>
      <p class="muted small">Mỗi bạn giữ tối đa ${HOLD_LIMIT} bài chưa đăng, để kho còn bài cho cả nhóm. Đăng một bài trước, hoặc đổi một bài dưới đây lấy bài vừa chọn.</p>
      <ol class="limit-list">${held.map(({ a }) => `<li><span class="t">${esc(firstLine(a.card.op, 90))}${feed.mine.started.has(a.id) ? '<span class="tag gold">Đang làm dở</span>' : ''}</span>
        <button type="button" class="btn btn-line sm" data-choice="${esc(a.id)}">Đổi</button></li>`).join('')}</ol>
      <div class="row-actions"><button type="button" class="btn btn-ink" data-choice="later">Để sau</button></div>`);
    const old = held.find(({ a }) => a.id === choice)?.a;
    if (!old || !(await unhold(old.card.id, old.id))) return;
    if (await hold(id, list.querySelector(`[data-card="${CSS.escape(id)}"] [data-hold]`))) toast('Đã đổi. Bài cũ về kho chung, bài mới là của bạn.');
  }

  async function toggleHold(button) {
    const id = button.dataset.hold;
    const assignmentId = button.dataset.assignment;
    if (assignmentId) {
      // A card she copied or edited may be up on Threads already: ask before it goes back.
      if (feed.mine?.started.has(assignmentId)) {
        const choice = await ask(`<h2>Bỏ giữ bài bạn đang làm dở?</h2>
          <p class="muted small">Bạn đã sao chép hoặc sửa bài này. Nếu bạn đã đăng rồi, mở bài và bấm Đã đăng xong.</p>
          <div class="leave-acts"><button type="button" class="btn btn-ink" data-choice="open">Mở bài</button>
            <button type="button" class="btn btn-line" data-choice="release">Bỏ giữ, trả về kho chung</button>
            <button type="button" class="linkish" data-choice="keep">Giữ lại</button></div>`);
        if (choice === 'open') { location.hash = `#/bai/${encodeURIComponent(assignmentId)}`; return; }
        if (choice !== 'release') return;
      }
      if (await unhold(id, assignmentId, button)) toast('Đã bỏ giữ. Bài về kho chung cho cả nhóm.');
      return;
    }
    if (!seeding) { toast('Thêm một tài khoản seeding trong Cài đặt rồi giữ bài nhé.'); return; }
    if (feed.holdCount >= HOLD_LIMIT) { limitSheet(id); return; }
    hold(id, button);
  }

  function expand(button) {
    const li = button.closest('.fc');
    const text = li.querySelector('[data-clamp]');
    text.style.maxHeight = `${text.clientHeight}px`;
    text.classList.remove('is-cut');
    requestAnimationFrame(() => { text.style.maxHeight = `${text.scrollHeight}px`; });
    text.addEventListener('transitionend', () => { text.style.maxHeight = 'none'; li.classList.add('is-full'); }, { once: true });
    button.hidden = true;
    const card = cardOf(li);
    if (card) card.full = true;
  }

  function setFilter(button) {
    if (feed.filter === button.dataset.filter) return;
    feed.filter = button.dataset.filter;
    feed.token += 1;
    feed.cards = [];
    feed.done = false;
    feed.next = null;
    busy = false;
    main.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === button)));
    // The list starts again at the top of the pool, and so does she if she had scrolled past it.
    const top = main.querySelector('#pool').getBoundingClientRect().top + window.scrollY - 70;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'instant' });
    list.innerHTML = '';
    more();
  }

  main.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !main.contains(b)) return;
    if (b.dataset.hold) toggleHold(b);
    else if ('holdCount' in b.dataset) main.querySelector('#today-top').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if ('more' in b.dataset) expand(b);
    else if (b.dataset.filter) setFilter(b);
    else if ('feedRetry' in b.dataset) more();
    else if ('talkToggle' in b.dataset || 'talkOlder' in b.dataset) {
      // talk.js has already opened the thread; the card remembers it for the way back.
      const li = b.closest('.fc');
      const card = li && cardOf(li);
      if (card) Object.assign(card, { open: li.querySelector('.talk').classList.contains('is-open'), showOld: card.showOld || 'talkOlder' in b.dataset });
    }
    else if ('jump' in b.dataset) main.querySelector('#pool').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // The chunks already in memory come back at once and without the entry motion; otherwise the first chunk loads.
  if (feed.cards.length) {
    append(feed.cards, { animate: false });
    paintEnd();
  } else more();

  wireTalk(list, ctx, {
    onChange(cardId, notes) {
      const card = feed.cards.find((c) => c.id === cardId);
      if (card) card.comments = notes;
    },
  });
}

/* ---------- The page ---------- */

function wireTop(main, ctx, m) {
  const top = main.querySelector('#today-top');
  top.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'a2hs-ok') {
      try { localStorage.setItem(A2HS, '1'); } catch { /* storage blocked */ }
      main.querySelector('#a2hs')?.remove();
    } else if (b.id === 'mint') mint(main, m.linkFrom);
    else if (b.dataset.takeBack) {
      // Dùng lại puts a card she set aside back among the cards she holds (Nam, 2026-09-28).
      const a = m.assignments.find((x) => x.id === b.dataset.takeBack);
      b.disabled = true;
      try {
        await recordEvent({ type: 'skip_undo', assignment_id: a.id, card_id: a.card.id });
        toast('Đã đưa bài về mục Bạn đang giữ.');
        renderToday(main, ctx);
      } catch { toast('Chưa lưu được. Thử lại nhé.'); b.disabled = false; }
    }
  };
  paintFeedback(main, ctx, m.questions).catch(() => { /* the list returns on the next visit */ });
}

export async function renderToday(main, ctx) {
  if (feed.member !== ctx.me.id || Date.now() - feed.at > FRESH_MS) {
    Object.assign(feed, { member: ctx.me.id, cards: [], total: 0, allTotal: 0, done: false, next: null, mine: null, token: feed.token + 1 });
    threads.clear();
  }
  const reuse = Boolean(feed.mine && feed.cards.length);
  // Coming back from a card, the page paints from memory at once and main.js restores her place; her cards load
  // behind it and the top repaints in place. A first visit waits for her cards and the first chunk together.
  if (!feed.cards.length) feed.next = { key: `${feed.filter}:0`, promise: loadPoolPage({ offset: 0, limit: FEED_CHUNK, filter: feed.filter }) };
  const m = reuse ? feed.mine : await loadMine(ctx);
  if (!reuse && feed.next) await feed.next.promise.catch(() => null);
  feed.mine = m;
  feed.holdCount = m.holding.length;

  main.innerHTML = `<div id="today-top">${topHtml(ctx, m)}</div>
    <section class="pool-sec" id="pool" aria-labelledby="pool-title">
      <div class="feed-head"><div><p class="eyebrow">Kho chung · cả nhóm</p><h2 class="section-title" id="pool-title">${feed.allTotal ? poolTitle(feed.allTotal) : 'Kho chung'}</h2>
        <p class="sub">Bấm dấu giữ để giữ bài cho bạn, tối đa ${HOLD_LIMIT} bài; bài bạn giữ rời kho của cả nhóm. Thấy ý bài có vấn đề thì viết vào Góp ý nội dung, bài vẫn ở kho cho bạn khác.</p></div></div>
      <div class="feed-tools"><div class="seg" role="group" aria-label="Lọc bài">${FEED_FILTERS.map(([v, l]) => `<button type="button" data-filter="${v}" aria-pressed="${feed.filter === v}">${l}</button>`).join('')}</div>
        <span class="feed-count" id="feed-count">${feed.filter !== 'all' && feed.total ? `${num(feed.total)} bài` : ''}</span>
        <button type="button" class="hold-count${feed.holdCount >= HOLD_LIMIT ? ' is-full' : ''}" data-hold-count aria-label="Bài bạn đang giữ">${countHtml(feed.holdCount)}</button></div>
      <ol class="feed" id="feed"></ol>
      <div class="feed-end" id="feed-end" aria-live="polite"></div>
    </section>`;
  if (reuse) main.dataset.keepScroll = '1';
  wireTop(main, ctx, m);
  wireFeed(main, ctx, { seeding: m.seeding });

  if (reuse) refreshTop(main, ctx);
}
