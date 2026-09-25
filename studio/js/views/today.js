import { loadWeeksFor, loadAssignments, loadEvents, loadPosts, loadQuestions, recordEvent } from '../data.js';
import { vnDate, mondayOf, choiceState, remaining, todayPlan } from '../lib/week.js';
import { pendingQuestions, reviewable } from '../lib/feedback.js';
import { appLink, buildCt, fillTemplate, mintCreativeCode } from '../lib/ct.js';
import { esc, copyText, toast, icon, cardTags } from '../ui.js';
import { settingsFor } from './shared.js';
import { renderQuestions } from './feedback.js';

const DAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const FILTERS = [['all', 'Tất cả'], ['ask', 'Hỏi'], ['line', 'Một câu'], ['strong', 'Lan mạnh']];
let filter = 'all';

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d}/${m}`;
}
const shortWeek = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
// Accounts of one member differ by their last part (…a, …b), so that letter marks them.
const mark = (handle) => String(handle).split(/[._]/).filter(Boolean).at(-1)?.charAt(0) ?? '@';

function ticket(p) {
  const handle = `<span class="handle"><i class="av sm">${esc(mark(p.account.handle))}</i><span>@${esc(p.account.handle)}</span></span>`;
  if (!p.assignment) {
    return `<div class="ticket empty"><div class="ticket-top">${handle}</div><p>Hết bài tuần này cho tài khoản này.</p></div>`;
  }
  const c = p.assignment.card;
  const status = p.status === 'posted' ? `<span class="tag ok">${icon('check')}Đã đăng</span>`
    : p.status === 'chosen' ? '<span class="tag gold">Đang đăng</span>' : '<span class="tag line">Chưa đăng</span>';
  return `<a class="ticket${p.status === 'posted' ? ' done' : ''}" href="#/bai/${esc(p.assignment.id)}">
    <div class="ticket-top">${handle}${status}</div>
    <p class="ticket-op">${esc(c.op)}</p>
    <div class="ticket-foot"><span class="tags">${cardTags(c, { dark: p.status === 'posted' })}</span>
      <span class="go">${p.status === 'posted' ? 'Xem lại' : p.status === 'chosen' ? 'Tiếp tục' : 'Mở bài'}${icon('right')}</span></div></a>`;
}

const row = (a, i, { used = false, posted = false } = {}) => `<li><a class="lib-row${used ? ' is-used' : ''}" href="#/bai/${esc(a.id)}">
  <span class="n">${used ? (posted ? '✓' : '•') : String(i + 1).padStart(2, '0')}</span>
  <span><span class="t">${esc(a.card.op)}</span><span class="tags">${used ? `<span class="tag ${posted ? 'ok' : 'gold'}">${posted ? 'Đã đăng' : 'Đã chọn'}</span>` : ''}${cardTags(a.card)}</span></span>
  <span class="arrow">${icon('right')}</span></a></li>`;

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

export async function renderToday(main, ctx) {
  const today = vnDate();
  const mine = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id);
  const cardAccounts = mine.filter((a) => a.kind === 'card');
  const creative = mine.find((a) => a.kind === 'creative') ?? null;
  const weeks = await loadWeeksFor(ctx.me.id);
  const current = mondayOf(today);
  const weekId = weeks.includes(ctx.activeWeek) ? ctx.activeWeek : weeks.includes(current) ? current
    : [...weeks].filter((w) => w > current).sort()[0] ?? weeks[0] ?? null;
  ctx.activeWeek = weekId;
  const assignments = weekId ? await loadAssignments(weekId, ctx.me.id) : [];
  const [posts, questions] = await Promise.all([loadPosts(assignments.map((a) => a.id)), loadQuestions(ctx.me.id)]);
  const events = await loadEvents([...new Set([...assignments.map((a) => a.id), ...questions.map((q) => q.assignment_id)])]);
  const choices = choiceState(events);
  for (const p of posts) choices.set(p.assignment_id, { account_id: p.account_id, at: p.published_at, ct: p.ct });
  const skipped = new Set(events.filter((e) => e.type === 'skipped').map((e) => e.assignment_id));
  const available = assignments.filter((a) => !skipped.has(a.id));
  const isPosted = (id) => posts.some((post) => post.assignment_id === id);
  const plan = todayPlan({ assignments: available, cardAccounts, choices, today }).map((p) => ({ ...p,
    status: isPosted(p.assignment?.id) ? 'posted' : p.status }));
  const shown = new Set(plan.map((p) => p.assignment?.id).filter(Boolean));
  const left = remaining(available, choices).filter((a) => !shown.has(a.id));
  const used = assignments.filter((a) => choices.has(a.id) && !shown.has(a.id));
  const toReview = weekId ? reviewable(assignments, events, posts).length : 0;

  const due = plan.filter((p) => p.assignment && p.status !== 'posted').length;
  const done = plan.filter((p) => p.status === 'posted').length;
  const headline = !weekId ? 'Tuần này chưa có bài.'
    : !plan.some((p) => p.assignment) ? 'Hết bài cho tuần này.'
    : due === 0 ? 'Xong hết hôm nay. <span class="gold">Nghỉ thôi.</span>'
    : `Hôm nay có <span class="gold">${due}&nbsp;bài</span> cho bạn.`;
  const lede = !weekId ? 'Bài mới có trước 22:00 Chủ nhật.'
    : due ? 'Mở bài, chọn tài khoản, sao chép ba phần theo thứ tự rồi dán vào Threads.'
    : 'Bài đã đăng sẽ có số liệu sau lần đọc Threads hằng ngày.';
  const weekNote = weekId > current ? ' · xem trước' : weekId && weekId < current ? ' · tuần trước' : '';

  main.innerHTML = `${ctx.me.is_demo ? `<p class="notice">${icon('info')}<span>Tài khoản mẫu để thử portal. Bài là nội dung đã chuẩn bị; các tên @vika.demo chưa phải tài khoản Threads thật.</span></p>` : ''}
    <section class="stage today-hero">
      <p class="eyebrow">${esc(formatDay(today))}${weekId ? ` · Tuần ${esc(shortWeek(weekId))}${weekNote}` : ''}</p>
      <h1>${headline}</h1>
      <div class="hero-meta"><p>${esc(lede)}</p>
        ${plan.length ? `<div class="progress" role="img" aria-label="${done} trên ${plan.length} tài khoản đã đăng hôm nay"><span class="bars">${plan.map((p) => `<i class="${p.status === 'posted' ? 'on' : p.status === 'chosen' ? 'half' : ''}"></i>`).join('')}</span>${done}/${plan.length} đã đăng</div>` : ''}</div>
      ${plan.length ? `<div class="tickets">${plan.map(ticket).join('')}</div>` : ''}
    </section>
    <div id="questions"></div>
    ${weekId ? `<section class="section">
      <div class="section-head"><div><p class="eyebrow">Kho bài</p><h2 class="section-title">Bài còn lại của tuần</h2></div>
        <span class="count">${left.length} bài chờ · ${assignments.length} cả tuần</span></div>
      <div class="library-tools"><div class="seg" role="group" aria-label="Lọc bài">${FILTERS.map(([v, l]) => `<button type="button" data-filter="${v}" aria-pressed="${filter === v}">${l}</button>`).join('')}</div>
        ${weeks.length > 1 ? `<label><span class="sr-only">Tuần bài</span><select id="active-week">${weeks.map((w) => `<option value="${w}"${w === weekId ? ' selected' : ''}>Tuần ${shortWeek(w)}${w > current ? ' · xem trước' : ''}</option>`).join('')}</select></label>` : ''}</div>
      <ol class="library" id="library"></ol>
      ${used.length ? `<details class="fold"><summary>Đã chọn hoặc đã đăng · ${used.length}<span class="plus"></span></summary><div class="fold-body"><ol class="library">${used.map((a, i) => row(a, i, { used: true, posted: isPosted(a.id) })).join('')}</ol></div></details>` : ''}
    </section>` : ''}
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
  if (creative) wireCreative(main, ctx, creative);
  renderQuestions(main.querySelector('#questions'), pendingQuestions(questions, events, ctx.me.id));
  main.querySelector('#active-week')?.addEventListener('change', (e) => { ctx.activeWeek = e.target.value; renderToday(main, ctx); });
}
