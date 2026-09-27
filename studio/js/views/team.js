import { loadTeamActivity, loadLatestObservations, loadLatestOps } from '../data.js';
import { addDays, mondayOf, vnDate } from '../lib/week.js';
import { teamItems, teamWeek, teamWeekIds } from '../lib/team.js';
import { esc, icon, initial } from '../ui.js';

const DAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const VN = 'Asia/Ho_Chi_Minh';
const dm = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
const weekday = (iso) => { const [y, m, d] = iso.split('-').map(Number); return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
const vnTime = (at) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN, hour: '2-digit', minute: '2-digit' }).format(new Date(at));
const num = (v) => new Intl.NumberFormat('vi-VN').format(v ?? 0);
const firstName = (name) => String(name ?? '').trim().split(/\s+/).slice(-2).join(' ');

/* ---------- The week grid: one row per member, one cell per day ---------- */

function cell(day, p) {
  const n = p.posted;
  const status = p.confirmed ? 'confirmed' : n ? 'claimed' : p.open ? 'open' : 'none';
  const label = `${firstName(p.member.name)}, ${weekday(day.date)} ${dm(day.date)}: ${n ? `${n} bài` : 'chưa đăng'}${p.open ? `, ${p.open} đang mở` : ''}`;
  if (day.when === 'future') return `<span class="tg-cell future" aria-hidden="true"><i></i></span>`;
  return `<button type="button" class="tg-cell ${day.when} ${status}" data-day="${day.date}" aria-label="${esc(label)}"><i>${n || ''}</i></button>`;
}

function gridHtml(week, members) {
  const head = week.days.map((d, i) => `<span class="tg-d${d.when === 'today' ? ' today' : ''}">${DAY_SHORT[i]}<small>${dm(d.date)}</small></span>`).join('');
  const rows = members.map((m) => {
    const total = week.totals.find((t) => t.member.id === m.id).posted;
    return `<span class="tg-who"><i class="av sm">${esc(initial(m.name))}</i><span><b>${esc(firstName(m.name))}</b><small>${total} bài</small></span></span>${week.days.map((d) => cell(d, d.perMember.find((p) => p.member.id === m.id))).join('')}`;
  }).join('');
  return `<div class="tg" style="--rows:${members.length}"><span></span>${head}${rows}</div>
    <p class="strip-sum"><span>Bấm một ô để tới ngày đó.</span><span class="strip-key"><i class="k on"></i>đã xác nhận<i class="k ring"></i>chờ xác nhận<i class="k miss"></i>không đăng</span></p>`;
}

/* ---------- One day: who posted, then each post ---------- */

function statusTag(it) {
  if (it.status === 'confirmed') return `<span class="tag ok">${icon('check')}Đã xác nhận</span>`;
  if (it.status === 'claimed') return '<span class="tag gold">Chờ xác nhận</span>';
  if (it.status === 'missing') return '<span class="tag warn">Chưa thấy trên Threads</span>';
  return '<span class="tag line">Đã chọn, chưa bấm đăng</span>';
}

function postRow(it, observations, ops) {
  const o = it.post ? observations.get(it.post.id) : null;
  const text = it.assignment?.card.op ?? (it.post ? ops.get(it.post.id) : null) ?? 'Bài tự viết (chưa đọc được nội dung).';
  const nums = o ? `<span class="num"><b>${num(o.views)}</b> lượt xem · <b>${num(o.other_replies ?? o.replies)}</b> trả lời · <b>${num(o.reposts)}</b> đăng lại</span>`
    : it.status === 'confirmed' ? '<span>Số liệu có sau lần đọc đầu tiên.</span>' : '';
  const link = it.post?.source_url ? `<a class="linkish tm-out" href="${esc(it.post.source_url)}" target="_blank" rel="noopener">Mở trên Threads${icon('out')}</a>` : '';
  const railMark = it.status === 'confirmed' ? icon('check') : '';
  return `<li class="led ${it.status === 'chosen' ? 'open' : it.status}"><span class="led-rail"><i>${railMark}</i></span>
    <div class="led-body">
      <div class="led-top"><span class="tm-who"><i class="av sm">${esc(initial(it.member.name))}</i><b>${esc(firstName(it.member.name))}</b>${it.account ? `<span class="tm-handle">@${esc(it.account.handle)}</span>` : ''}${it.kind === 'creative' ? '<span class="tag gold">Tự viết</span>' : ''}</span>
        <span class="led-when">${esc(vnTime(it.at))}</span></div>
      <p class="led-op">${esc(text)}</p>
      <div class="led-foot">${statusTag(it)}${nums}${link}</div>
    </div></li>`;
}

function dayHtml(day, today, observations, ops) {
  const posted = day.perMember.reduce((n, p) => n + p.posted, 0);
  const who = day.perMember.map((p) => p.posted
    ? `<span class="tag ok">${esc(firstName(p.member.name))} · ${p.posted}</span>`
    : `<span class="tag ${day.when === 'today' ? 'line' : 'warn'}">${esc(firstName(p.member.name))} · chưa đăng</span>`).join('');
  const eyebrow = day.when === 'today' ? 'Hôm nay' : day.date === addDays(today, -1) ? 'Hôm qua' : weekday(day.date);
  return `<section class="section tm-day" id="ngay-${day.date}">
    <div class="section-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2 class="section-title">${esc(weekday(day.date))}, ${dm(day.date)}</h2></div>
      <span class="count">${posted} bài đã đăng</span></div>
    <div class="tags tm-sum">${who}</div>
    ${day.items.length ? `<ol class="ledger">${day.items.map((it) => postRow(it, observations, ops)).join('')}</ol>`
    : `<div class="ledger-empty"><p>${day.when === 'today' ? 'Chưa ai đăng hôm nay.' : 'Không ai đăng ngày này.'}</p></div>`}
  </section>`;
}

/* ---------- The page ---------- */

export async function renderTeam(main, ctx) {
  const today = vnDate();
  const current = mondayOf(today);
  // The sample member only shows to itself; real members never see its fake posts here.
  const members = ctx.team.members.filter((m) => ctx.me.is_demo || !m.is_demo);
  const accounts = ctx.team.accounts.filter((a) => members.some((m) => m.id === a.member_id));
  const { assignments, events, posts } = await loadTeamActivity();
  const items = teamItems({ members, accounts, assignments, events, posts });
  const weeks = teamWeekIds(items, today);
  const weekId = weeks.includes(ctx.teamWeek) ? ctx.teamWeek : current;
  ctx.teamWeek = weekId;
  const week = teamWeek({ weekId, today, members, items });
  const inWeek = week.days.flatMap((d) => d.items).filter((it) => it.post);
  const [observations, ops] = await Promise.all([
    loadLatestObservations(inWeek.map((it) => it.post.id)),
    loadLatestOps(inWeek.filter((it) => it.kind === 'creative').map((it) => it.post.id)),
  ]);
  const shown = week.days.filter((d) => d.when !== 'future').reverse();
  const total = week.totals.reduce((n, t) => n + t.posted, 0);
  const isCurrent = weekId === current;

  main.innerHTML = `<section class="stage tm-hero">
      <div class="hero-grid">
        <div class="hero-lead">
          <p class="eyebrow">Cả nhóm · Tuần ${dm(weekId)} – ${dm(addDays(weekId, 6))}</p>
          <h1>${isCurrent ? 'Tuần này' : `Tuần ${dm(weekId)}`} nhóm đăng <span class="gold">${total}&nbsp;bài.</span></h1>
          <p class="lede">Mỗi ngày một mục, mới nhất ở trên. Chờ xác nhận là thành viên đã bấm Đã đăng xong; đã xác nhận là máy đọc Threads lúc 06:00 đã thấy bài.</p>
          ${weeks.length > 1 ? `<label class="tm-week"><span class="sr-only">Tuần</span><select id="team-week">${weeks.map((w) => `<option value="${w}"${w === weekId ? ' selected' : ''}>Tuần ${dm(w)}${w === current ? ' · tuần này' : ''}</option>`).join('')}</select></label>` : ''}
        </div>
        <div class="strip">${gridHtml(week, members)}</div>
      </div>
    </section>
    <div class="tm-days">${shown.length ? shown.map((d) => dayHtml(d, today, observations, ops)).join('')
    : '<div class="ledger-empty" style="margin-top:32px"><p>Tuần này chưa bắt đầu.</p></div>'}</div>`;

  main.querySelectorAll('.tg-cell[data-day]').forEach((b) => { b.onclick = () => {
    main.querySelector(`#ngay-${b.dataset.day}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }; });
  main.querySelector('#team-week')?.addEventListener('change', (e) => { ctx.teamWeek = e.target.value; renderTeam(main, ctx); });
}
