import { loadWeeksFor, loadAssignments, loadEvents, loadPosts, loadQuestions, loadLatestObservations, recordEvent } from '../data.js';
import { vnDate, mondayOf, postingState, remaining, todayPlan, postedToday, weekStrip, skippedIds } from '../lib/week.js';
import { pendingQuestions, reviewable } from '../lib/feedback.js';
import { appLink, buildCt, fillTemplate, mintCreativeCode } from '../lib/ct.js';
import { esc, copyText, toast, icon, cardTags } from '../ui.js';
import { settingsFor, isActive } from './shared.js';
import { renderQuestions } from './feedback.js';

const DAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const FILTERS = [['all', 'Tất cả'], ['ask', 'Hỏi'], ['line', 'Một câu'], ['strong', 'Lan mạnh']];
const VN = 'Asia/Ho_Chi_Minh';
let filter = 'all';

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d}/${m}`;
}
const shortWeek = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
const shortDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
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

/* ---------- Hero: the week strip and the tickets ---------- */

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

// A ticket is the next card to post, not an account: she posts it on whichever of her accounts she likes.
function ticket(p, i) {
  const label = `<span class="handle"><span>Bài ${i + 1}</span></span>`;
  const status = p.status === 'open' ? '<span class="tag line">Chưa đăng</span>' : '';
  if (!p.assignment) {
    return `<article class="ticket is-empty"><div class="ticket-top">${label}${status}</div>
      <p class="ticket-op">Hết bài tuần này.</p></article>`;
  }
  const c = p.assignment.card;
  const href = `#/bai/${esc(p.assignment.id)}`;
  const kicker = '';
  const act = `<a class="go" href="${href}">Mở bài${icon('right')}</a>`;
  return `<article class="ticket is-${p.status}">
    <div class="ticket-top">${label}${status}</div>
    ${kicker}
    <a class="ticket-link" href="${href}"><span class="ticket-op">${esc(c.op)}</span></a>
    <div class="ticket-foot"><span class="tags">${cardTags(c)}</span><span class="acts">${act}</span></div></article>`;
}

/* ---------- The ledger: this week's posts and where the read of Threads stands ---------- */

function ledgerRow(item, today, observation) {
  const { a, s } = item;
  const account = item.account;
  const at = s.status === 'confirmed' ? (s.posted_at ?? s.published_at) : s.posted_at;
  const dot = s.status === 'confirmed' ? icon('check') : '';
  let foot;
  if (s.status === 'claimed') foot = `<span class="tag gold">Chờ xác nhận</span><span>Máy đọc Threads lúc ${nextRead()}</span>`;
  else if (s.status === 'missing') foot = `<span class="tag warn">Chưa thấy trên Threads</span><span>Bài đã về kho. Kiểm tra link ở bình luận 2, rồi mở bài để đăng lại.</span>`;
  else foot = `<span class="tag ok">${icon('check')}Đã xác nhận</span>${observation
    ? `<span class="num"><b>${num(observation.views ?? 0)}</b> lượt xem · <b>${num(observation.other_replies ?? observation.replies ?? 0)}</b> trả lời · <b>${num(observation.reposts ?? 0)}</b> đăng lại</span>`
    : '<span>Số liệu có sau lần đọc đầu tiên.</span>'}`;
  return `<li class="led ${s.status}"><span class="led-rail"><i>${dot}</i></span>
    <div class="led-body"><div class="led-top">${account ? handleHtml(account) : ''}<span class="led-when">${esc(whenLabel(at, today))}</span></div>
      <a class="led-op" href="#/bai/${esc(a.id)}">${esc(a.card.op)}</a>
      <div class="led-foot">${foot}</div></div></li>`;
}

/* ---------- Library, hint, creative ---------- */

const row = (a, i, { note = null, after = '' } = {}) => `<li${after ? ' class="has-action"' : ''}><a class="lib-row${note ? ' is-used' : ''}" href="#/bai/${esc(a.id)}">
  <span class="n">${note ? '•' : String(i + 1).padStart(2, '0')}</span>
  <span><span class="t">${esc(a.card.op)}</span><span class="tags">${note ? `<span class="tag ${note[1]}">${esc(note[0])}</span>` : ''}${cardTags(a.card)}</span></span>
  <span class="arrow">${icon('right')}</span></a>${after}</li>`;

const matches = (a) => filter === 'all' || a.card.engine === filter || a.card.pull === filter;

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

function creativeTile(account) {
  return `<section class="stage gold tile"><p class="eyebrow">Tài khoản sáng tạo · @${esc(account.handle)}</p>
    <h3>Bài tự viết cũng có link tải app riêng.</h3>
    <p class="muted small">Tạo link cho từng bài mới rồi dán vào bình luận 2, để biết bài nào mang về lượt cài.</p>
    <div class="foot"><button class="btn btn-ink" id="mint">${icon('link')}Tạo link cho bài mới</button></div>
    <div id="minted"></div></section>`;
}

function wireCreative(main, ctx, account) {
  main.querySelector('#mint').onclick = async () => {
    const s = settingsFor(ctx, account);
    const code = mintCreativeCode();
    const ct = buildCt(s.account_code, code);
    const text = fillTemplate(s.r2_template, appLink(ct));
    await recordEvent({ type: 'creative_link', account_id: account.id, payload: { ct, code, settings_at: s.created_at } });
    main.querySelector('#minted').innerHTML = `<div class="minted"><p class="eyebrow">Bình luận 2 · link mới</p><p class="plain">${esc(text)}</p>
      <button class="btn btn-ink sm" id="copy-creative">${icon('copy')}Sao chép</button></div>`;
    main.querySelector('#copy-creative').onclick = async (e) => {
      const button = e.currentTarget;
      if (await copyText(text)) {
        button.innerHTML = `${icon('check')}Đã sao chép`;
        toast('Đã sao chép. Dán vào Threads nhé.');
      }
    };
  };
}

/* ---------- The page ---------- */

export async function renderToday(main, ctx) {
  const today = vnDate();
  const mine = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id);
  // A retired account still names its old posts, but holds no slot and no creative tile.
  const cardAccounts = mine.filter((a) => a.kind === 'card');
  const creative = mine.find((a) => a.kind === 'creative' && isActive(a)) ?? null;
  const weeks = await loadWeeksFor(ctx.me.id);
  const current = mondayOf(today);
  const weekId = weeks.includes(ctx.activeWeek) ? ctx.activeWeek : weeks.includes(current) ? current
    : [...weeks].filter((w) => w > current).sort()[0] ?? weeks[0] ?? null;
  ctx.activeWeek = weekId;
  const assignments = weekId ? await loadAssignments(weekId, ctx.me.id) : [];
  const [posts, questions] = await Promise.all([loadPosts(assignments.map((a) => a.id)), loadQuestions(ctx.me.id)]);
  const events = await loadEvents([...new Set([...assignments.map((a) => a.id), ...questions.map((q) => q.assignment_id)])]);
  const states = postingState(events, posts);
  const skipped = skippedIds(events);
  const available = assignments.filter((a) => !skipped.has(a.id));
  const accountOf = (id) => cardAccounts.find((x) => x.id === id) ?? null;

  // One slot per card account is the daily target; which account each post goes on is hers to pick.
  const slots = Math.max(1, cardAccounts.filter(isActive).length);
  const plan = todayPlan({ assignments: available, slots, states });
  const strip = weekId ? weekStrip({ weekId, today, slots, states }) : null;
  const shown = new Set(plan.filter((p) => p.status === 'open').map((p) => p.assignment.id));
  const left = remaining(available, states).filter((a) => !shown.has(a.id));
  // Only the daily read knows the account, so a claim shows none until it is confirmed.
  const ledger = assignments.map((a) => ({ a, s: states.get(a.id) })).filter(({ s }) => s)
    .map((it) => ({ ...it, account: it.s.status === 'confirmed' ? accountOf(it.s.account_id) : null }));
  const rank = { claimed: 0, missing: 1, confirmed: 2 };
  const stamp = (s) => Date.parse(s.posted_at ?? s.published_at ?? s.at ?? 0);
  ledger.sort((x, y) => rank[x.s.status] - rank[y.s.status] || stamp(y.s) - stamp(x.s));
  const observations = await loadLatestObservations(ledger.filter(({ s }) => s.status === 'confirmed').map(({ s }) => s.post.id));
  const elsewhere = assignments.filter((a) => skipped.has(a.id) && !states.has(a.id)).map((a) => ({ a, note: ['Đã bỏ qua', 'line'] }));
  const toReview = weekId ? reviewable(assignments, events, posts).length : 0;

  const due = plan.filter((p) => p.status === 'open').length;
  const doneToday = postedToday(assignments, states, today);
  const waiting = ledger.filter(({ s }) => s.status === 'claimed').length;
  const confirmed = ledger.filter(({ s }) => s.status === 'confirmed').length;
  const headline = !weekId ? 'Tuần này chưa có bài.'
    : plan[0].status === 'empty' ? 'Hết bài cho tuần này.'
    : doneToday >= slots ? `Hôm nay đã đăng <span class="gold">${doneToday}&nbsp;bài</span>. Nghỉ thôi.`
    : doneToday ? `Hôm nay đã đăng <span class="gold">${doneToday}&nbsp;bài</span>.`
    : `Hôm nay có <span class="gold">${slots}&nbsp;bài</span> cho bạn.`;
  const lede = !weekId ? 'Bài mới có trước 22:00 Chủ nhật.'
    : doneToday < slots && due ? 'Mở bài, sao chép ba phần rồi dán vào Threads, trên tài khoản nào của bạn cũng được. Đăng xong thì bấm Đã đăng xong: bài chuyển xuống mục chờ xác nhận và bài kế tiếp lên thay.'
    : waiting ? `Máy đọc Threads lúc ${nextRead()} sẽ xác nhận bài và bắt đầu đếm số liệu.`
    : 'Bài đã đăng có số liệu sau mỗi lần đọc Threads buổi sáng.';
  const weekNote = weekId > current ? ' · xem trước' : weekId && weekId < current ? ' · tuần trước' : '';

  main.innerHTML = `${ctx.me.is_demo ? `<p class="notice">${icon('info')}<span>Tài khoản mẫu để thử portal. Bài là nội dung đã chuẩn bị; các tên @vika.demo chưa phải tài khoản Threads thật.</span></p>` : ''}
    <section class="stage today-hero">
      <div class="hero-grid">
        <div class="hero-lead">
          <p class="eyebrow">${esc(formatDay(today))}${weekId ? ` · Tuần ${esc(shortWeek(weekId))}${weekNote}` : ''}</p>
          <h1>${headline}</h1>
          <p class="lede">${esc(lede)}</p>
        </div>
        ${strip ? stripHtml(strip, slots) : ''}
      </div>
      ${plan.length && weekId ? `<div class="tickets">${plan.map((p, i) => ticket(p, i)).join('')}</div>` : ''}
    </section>
    <div id="questions"></div>
    ${weekId ? `<div class="today-board">
      <section class="section ledger-sec">
        <div class="section-head"><div><p class="eyebrow">Bài đã đăng</p><h2 class="section-title">${waiting ? 'Chờ Threads xác nhận' : 'Tuần này đã đăng'}</h2></div>
          <span class="count">${waiting ? `${waiting} chờ · ` : ''}${confirmed} đã xác nhận</span></div>
        ${ledger.length ? `<ol class="ledger">${ledger.map((it) => ledgerRow(it, today, it.s.post ? observations.get(it.s.post.id) : null)).join('')}</ol>`
    : `<div class="ledger-empty"><p>Chưa có bài nào tuần này. Bài đầu tiên bạn đăng sẽ nằm ở đây, chờ máy đọc Threads xác nhận lúc 06:00 mỗi sáng.</p></div>`}
      </section>
      <section class="section">
        <div class="section-head"><div><p class="eyebrow">Kho bài</p><h2 class="section-title">Còn lại của tuần</h2></div>
          <span class="count">${left.length} bài chờ · ${assignments.length} cả tuần</span></div>
        <div class="library-tools"><div class="seg" role="group" aria-label="Lọc bài">${FILTERS.map(([v, l]) => `<button type="button" data-filter="${v}" aria-pressed="${filter === v}">${l}</button>`).join('')}</div>
          ${weeks.length > 1 ? `<label><span class="sr-only">Tuần bài</span><select id="active-week">${weeks.map((w) => `<option value="${w}"${w === weekId ? ' selected' : ''}>Tuần ${shortWeek(w)}${w > current ? ' · xem trước' : ''}</option>`).join('')}</select></label>` : ''}</div>
        <ol class="library" id="library"></ol>
        ${elsewhere.length ? `<details class="fold"><summary>Đã bỏ qua · ${elsewhere.length}<span class="plus"></span></summary><div class="fold-body"><ol class="library">${elsewhere.map(({ a, note }, i) => row(a, i, { note, after: `<button type="button" class="btn btn-line sm" data-take-back="${esc(a.id)}">Dùng lại</button>` })).join('')}</ol></div></details>` : ''}
      </section>
    </div>` : ''}
    <div class="duo">
      ${weekId ? `<a class="panel sand tile" href="#/cuoi-tuan/${weekId}"><p class="eyebrow">Cuối tuần</p><h3>Nhìn lại bài chưa dùng</h3>
        <p class="small muted">${toReview ? `${toReview} bài chưa đăng. Bài chưa dùng về kho cho tuần sau; cho biết vì sao nếu muốn.` : 'Không còn bài nào chưa xử lý.'}</p>
        <span class="foot"><span class="btn btn-line sm">Bắt đầu${icon('right')}</span></span></a>` : ''}
      ${creative ? creativeTile(creative) : ''}
    </div>
    ${homeHint()}`;

  const paintLibrary = () => {
    const list = left.filter(matches);
    main.querySelector('#library').innerHTML = list.length ? list.map((a) => row(a, left.indexOf(a))).join('')
      : `<li class="muted small" style="padding:18px 4px">${left.length ? 'Không có bài nào khớp bộ lọc này.' : 'Đã dùng hết bài của tuần.'}</li>`;
  };
  if (weekId) paintLibrary();
  main.querySelectorAll('[data-filter]').forEach((b) => { b.onclick = () => {
    filter = b.dataset.filter;
    main.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    paintLibrary();
  }; });
  main.querySelector('#a2hs-ok')?.addEventListener('click', () => {
    try { localStorage.setItem(A2HS, '1'); } catch { /* storage blocked */ }
    main.querySelector('#a2hs')?.remove();
  });
  // Dùng lại puts a card she set aside back in her queue, in its place (Nam, 2026-09-28).
  main.querySelectorAll('[data-take-back]').forEach((b) => { b.onclick = async () => {
    const a = assignments.find((x) => x.id === b.dataset.takeBack);
    b.disabled = true;
    try {
      await recordEvent({ type: 'skip_undo', assignment_id: a.id, card_id: a.card.id });
      toast('Đã đưa bài về kho.');
      renderToday(main, ctx);
    } catch { toast('Chưa lưu được. Thử lại nhé.'); b.disabled = false; }
  }; });
  if (creative) wireCreative(main, ctx, creative);
  renderQuestions(main.querySelector('#questions'), pendingQuestions(questions, events, ctx.me.id));
  main.querySelector('#active-week')?.addEventListener('change', (e) => { ctx.activeWeek = e.target.value; renderToday(main, ctx); });
}
