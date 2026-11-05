// Bảng vàng (Nam, 2026-11-03): in place of Số liệu and Nhóm. From the top: the team's dashboard for a week, a month or a
// quarter (charts first; folded, it keeps the three tiles that matter most), then one switch: Thi đua (the period's
// crowns, the leaderboard by XP and everyone's posts in Threads' layout) and Hoạt động (each member's days against her
// plan, with a tick or a cross). Every member sees all of it except Cần để ý, which only managers see. Charts answer a
// tap or a hover in a line under them, never in a box over them. The rules live in lib/board.js.
import { loadAnalytics, loadTeamActivity, isManager, loadTargets, loadCreativeLinks, loadPool } from '../data.js?v=20261104e';
import { vnDate, mondayOf, addDays } from '../lib/week.js';
import { postRows, profiles, crowns, teamWeek, teamAllTime, dailySeries, alerts, calendar, makeQuests, pendingWork, periodSeries,
  viewBands, chain, periodOf, prevPeriod, nextPeriod, periodDays, questsOf, ofKind, facts, XP, HIT, MEGA, BEAT } from '../lib/board.js?v=20261104e';
import { esc, icon, faceInner } from '../ui.js?v=20261104e';
import { FOCUS_KEY } from './targets.js?v=20261104e';

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('vi-VN');
const k = (v) => v == null ? '–' : compact.format(v);
const n = (v) => v == null ? '–' : whole.format(v);
const dm = (iso) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const weekday = (iso) => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const mondayGap = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const firstName = (name) => String(name ?? '').trim().split(/\s+/).slice(-2).join(' ');
const PAGE = 10;
const TIER = { mega: ['Siêu hit', 'mega'], hit: ['Hit', 'hit'], beat: ['Vượt mức', 'beat'] };
const KIND = { week: ['Tuần', 'tuần'], month: ['Tháng', 'tháng'], quarter: ['Quý', 'quý'] };
// Seeding and creative watched apart (Nam, 2026-11-04): one switch on the dashboard, the team feed and each profile.
const POST_KINDS = [['all', 'Tất cả'], ['seeding', 'Seeding'], ['creative', 'Sáng tạo']];
const isKind = (v) => POST_KINDS.some(([key]) => key === v);
// A switch of the three kinds; counts, when given, show how many posts each holds.
function kindSwitch(attr, on, { dark = false, counts = null, label = 'Loại bài' } = {}) {
  return `<div class="seg${dark ? ' dark' : ''} kind-seg" role="group" aria-label="${label}">${POST_KINDS.map(([key, name]) =>
    `<button type="button" data-${attr}="${key}" aria-pressed="${on === key}">${key === 'all' ? '' : `<i class="kg ${key === 'seeding' ? 'seed' : 'cre'}" aria-hidden="true"></i>`}${name}${counts ? `<small>${counts[key]}</small>` : ''}</button>`).join('')}</div>`;
}
const kindCounts = (rows) => ({ all: rows.length, seeding: ofKind(rows, 'seeding').length, creative: ofKind(rows, 'creative').length });
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
};
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const min = (a, b) => (a < b ? a : b);

function ago(iso, now) {
  const minutes = (now - Date.parse(iso)) / 60000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} phút`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ`;
  if (minutes < 7 * 1440) return `${Math.floor(minutes / 1440)} ngày`;
  return dm(vnDate(new Date(iso)));
}

// A period's name: 2/11 – 8/11, Tháng 11/2026, Quý 4/2026.
function periodName(p) {
  const [y, m] = p.from.split('-').map(Number);
  if (p.kind === 'week') return `${dm(p.from)} – ${dm(p.to)}`;
  if (p.kind === 'month') return `Tháng ${m}/${y}`;
  return `Quý ${(m + 2) / 3}/${y}`;
}
function periodShort(p) {
  const [, m] = p.from.split('-').map(Number);
  return p.kind === 'week' ? dm(p.from) : p.kind === 'month' ? `T${m}` : `Q${(m + 2) / 3}`;
}

// The morning read lands while the page may sit open in a background tab or the home-screen app. Coming back to it
// after two minutes or more reads the tables again (every read here keeps a copy for 60 seconds at most), so the
// numbers, today and the ticks follow the latest read without a tap. The page keeps its period, view and scroll.
const STALE = 120_000;
const states = new WeakMap();
const profileViews = new WeakMap();
let shown = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !shown?.main.isConnected || Date.now() - shown.at < STALE) return;
  const y = window.scrollY;
  renderBoard(shown.main, shown.ctx, shown.memberId, true).then(() => window.scrollTo(0, y)).catch((error) => console.error(error));
});

export async function renderBoard(main, ctx, memberId = null, again = false) {
  shown = { main, ctx, memberId, at: Date.now() };
  // Targets, links and the pool are extras: before migration member_targets the page runs on the default targets.
  const [data, activity, manager, targets, links, pool] = await Promise.all([loadAnalytics(), loadTeamActivity(),
    isManager().catch(() => false), loadTargets().catch(() => []), loadCreativeLinks().catch(() => []), loadPool().catch(() => null)]);
  const now = Date.now();
  const today = vnDate();
  const members = ctx.team.members.filter((m) => !m.is_demo);
  const team = { members, accounts: ctx.team.accounts };
  const rows = postRows({ team, posts: data.posts, observations: data.observations, versions: data.versions, cards: data.cards, events: activity.events }, now);
  const pending = pendingWork({ events: [...activity.events, ...links], posts: data.posts }, now);
  const quests = makeQuests({ rows, pending, targets, accounts: ctx.team.accounts, today });
  const model = { ctx, rows, members, team, activity, manager, now, today, quests, pool, first: rows[0]?.day ?? today,
    profiles: profiles(rows, members, today, quests) };
  if (memberId) {
    // A redraw keeps her sort and how many posts show; only opening the page animates (Nam, 2026-11-04).
    const kept = again ? profileViews.get(main) : null;
    const same = kept?.id === memberId;
    return paintProfile(main, model, memberId, same ? kept : { sort: 'views', shown: PAGE, kind: 'all' }, !same);
  }
  const kind = ['week', 'month', 'quarter'].includes(store.get('studio.board.kind')) ? store.get('studio.board.kind') : 'week';
  const before = again ? states.get(main) : null;
  // A period that held the old today moves with the day; a period she stepped back to stays.
  const was = before?.state.period;
  const period = was && !(was.from <= before.today && before.today <= was.to) ? was : periodOf(was?.kind ?? kind, today);
  const state = before ? Object.assign(before.state, { period, open: null }) : { period, view: store.get('studio.board.view') === 'activity' ? 'activity' : 'game',
    filter: 'all', who: '', sort: 'new', shown: PAGE, chart: 'views', open: null, folded: store.get('studio.board.dashOpen') !== '1',
    dashKind: isKind(store.get('studio.board.dashKind')) ? store.get('studio.board.dashKind') : 'all', feedKind: 'all', feedPeriod: null };
  states.set(main, { state, today });
  paintBoard(main, model, state, !before);
}

/* ---------- Shared pieces ---------- */

// Her photo or her initial inside a ring that fills with her progress through the level, with the level number on it.
// The parts carry their own classes, so the name's b and i rules around an avatar never reach them (Nam, 2026-11-04:
// .qw-who b made the disc a flex box and pushed it to the ring's left edge in Hoạt động).
function avatar(p, size = 44) {
  const r = size / 2 - 2.5;
  return `<span class="bv-av" style="--s:${size}px" aria-hidden="true">
    <svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bv-av-track"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bv-av-fill" pathLength="100" stroke-dasharray="${(Math.min(1, p.level.progress) * 100).toFixed(1)} 100" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
    <span class="bv-av-in">${faceInner(p.member)}</span><span class="bv-av-lv">${p.level.n}</span></span>`;
}

// An empty arc draws nothing, since a round cap on a zero-length stroke shows as a dot.
const arc = (cx, r, ratio, cls) => `<circle cx="${cx}" cy="${cx}" r="${r}" class="${cls}-t"/>${ratio > 0 ? `<circle cx="${cx}" cy="${cx}" r="${r}" class="${cls}" pathLength="100"
  style="--p:${(Math.min(1, ratio) * 100).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/>` : ''}`;

const move = (mv) => mv == null ? '<span class="bv-move new">mới</span>'
  : mv > 0 ? `<span class="bv-move up" title="Lên ${mv} hạng">▲ ${mv}</span>`
    : mv < 0 ? `<span class="bv-move down" title="Xuống ${-mv} hạng">▼ ${-mv}</span>` : '<span class="bv-move same">–</span>';

const flame = (count, risk = false, title = '') => count ? `<span class="bv-flame${risk ? ' risk' : ''}" title="${esc(title)}">${icon('flame')}${count}</span>` : '';

function tierTag(r) {
  if (!r.tier) return '';
  const [label, cls] = TIER[r.tier];
  return `<span class="bv-tier ${cls}">${esc(label)}</span>`;
}

// One post in Threads' layout: her avatar and a thread line down to the first comment, then the numbers.
function postHtml(m, r, { feature = false } = {}) {
  const p = m.profiles.get(r.member.id);
  const r1 = r.r1 ? `<div class="tp-r1"><span class="tp-mini" aria-hidden="true">${faceInner(r.member)}</span>
      <div><p class="tp-who"><b>${esc(r.account.handle)}</b></p><p class="tp-text cut">${esc(r.r1)}</p></div></div>` : '';
  const themes = r.themes.length ? `<p class="tp-heard"><span>Người đọc nhắc đến</span>${r.themes.slice(0, 2).map((t) => `<em>${esc(t.theme)}</em>`).join('')}</p>` : '';
  const xp = r.xpParts.map(([key, x]) => `${{ post: 'Đăng', beat: 'Vượt mức', hit: 'Hit', mega: 'Siêu hit' }[key]} +${x}`).join(' · ');
  return `<article class="tp${feature ? ' feature' : ''}${r.tier ? ` t-${r.tier}` : ''}">
    <div class="tp-head">
      <a class="tp-person" href="#/bang-vang/${esc(r.member.id)}">${avatar(p, feature ? 48 : 40)}
        <span><b>${esc(firstName(r.member.name))}</b><small>@${esc(r.account.handle)} · ${ago(r.published_at, m.now)}${r.creative ? ' · sáng tạo' : ''}</small></span></a>
      <span class="tp-badges">${tierTag(r)}<span class="bv-xp" title="${esc(xp)}">+${r.xp} XP</span></span>
    </div>
    <p class="tp-text${feature ? '' : ' cut'}">${esc(r.op || 'Bài sáng tạo')}</p>
    <ul class="tp-nums" aria-label="Số liệu">
      <li title="Lượt xem">${icon('eye')}<b>${k(r.views)}</b></li>
      <li title="Lượt thích">${icon('line')}<b>${k(r.likes)}</b></li>
      <li title="Lượt trả lời">${icon('reply')}<b>${k(r.replies)}</b></li>
      <li title="Đăng lại">${icon('repost')}<b>${k(r.reposts)}</b></li>
      ${r.edited ? '<li class="tp-edited">Đã sửa</li>' : ''}
      ${r.source_url ? `<li class="tp-open"><a href="${esc(r.source_url)}" target="_blank" rel="noopener" aria-label="Mở trên Threads">${icon('out')}</a></li>` : ''}
    </ul>
    ${feature ? '' : r1}${themes}
  </article>`;
}

// Numbers count up from zero on the first paint only, so a tap never replays them.
// Each number first takes the width of its widest value on the way up, so the text beside it never moves while it
// counts (Nam, 2026-11-04: the profile's views jittered). Digits are tabular, so only the separators and the unit change.
function countUp(root) {
  if (still()) return;
  const els = [...root.querySelectorAll('[data-count]')].map((el) => ({ el, to: +el.dataset.count, fmt: el.dataset.fmt === 'k' ? k : n }));
  for (const { el, fmt } of els) {
    el.style.display = 'inline-block';
    el.style.whiteSpace = 'nowrap';
    el.textContent = fmt(0);
  }
  // Studio builds a page before it puts it in the document, and a number outside the document has no font to measure.
  // So the numbers wait for the page, then each takes the width of its widest value and counts, in the same frame.
  let tries = 0;
  const begin = () => {
    if (!root.isConnected) { if (++tries < 120) requestAnimationFrame(begin); return; }
    for (const { el, to, fmt } of els) {
      // A value's width is at most its shape's written in the font's widest digit: '12,4 N' becomes '88,8 N' when 8 is
      // the widest. Ten digits, then each shape, are measured once.
      let digit = '0';
      let best = 0;
      for (const d of '0123456789') {
        el.textContent = d.repeat(4);
        const w = el.getBoundingClientRect().width;
        if (w > best) { best = w; digit = d; }
      }
      const shapes = new Set(Array.from({ length: 61 }, (_, i) => fmt(Math.round(to * (1 - 2 ** (-10 * (i / 60))))).replace(/\d/g, digit)));
      let wide = 0;
      for (const shape of shapes) {
        el.textContent = shape;
        wide = Math.max(wide, el.getBoundingClientRect().width);
      }
      el.style.minWidth = `${Math.ceil(wide)}px`;
      el.textContent = fmt(0);
    }
    const t0 = performance.now();
    const step = (t) => {
      // A frame's timestamp can come a moment before t0, which made the first value -0, wider than any other.
      const x = Math.min(1, Math.max(0, (t - t0) / 1100));
      for (const { el, to, fmt } of els) el.textContent = x < 1 ? fmt(Math.round(to * (1 - 2 ** (-10 * x)))) : fmt(to);
      if (x < 1) { requestAnimationFrame(step); return; }
      // The box eases from the reserved width to the final number's own, so the text after it settles in one glide.
      for (const { el } of els) {
        const reserved = el.style.minWidth;
        el.style.minWidth = '0px';
        const own = el.getBoundingClientRect().width;
        el.style.minWidth = reserved;
        el.getBoundingClientRect();
        el.style.transition = 'min-width .35s cubic-bezier(.16,1,.3,1)';
        el.style.minWidth = `${own}px`;
      }
    };
    requestAnimationFrame(step);
  };
  requestAnimationFrame(begin);
}

// A chart answers in the line under it: a mouse hover shows a mark's text, a tap keeps it until the next tap, and the
// line goes back to its summary when the mouse leaves. Nothing ever covers the chart, so a finger on a phone hides nothing.
function wireReadouts(root) {
  root.querySelectorAll('.has-read').forEach((fig) => {
    const line = fig.querySelector('.d-read');
    const rest = line.innerHTML;
    let pinned = null;
    const show = (el) => {
      line.innerHTML = el.dataset.read;
      fig.querySelectorAll('.is-on').forEach((x) => x.classList.remove('is-on'));
      el.classList.add('is-on');
    };
    const reset = () => { line.innerHTML = rest; fig.querySelectorAll('.is-on').forEach((x) => x.classList.remove('is-on')); };
    fig.querySelectorAll('[data-read]').forEach((el) => {
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(el); });
      el.addEventListener('click', () => { if (pinned === el) { pinned = null; reset(); } else { pinned = el; show(el); } });
    });
    fig.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { if (pinned) show(pinned); else reset(); } });
  });
}
const readAttr = (html) => ` data-read="${esc(html)}"`;

/* ---------- The dashboard ---------- */

// The period and the ones before it. The chosen period is gold; one still running is hatched, since its posts still grow.
function periodsChart(list) {
  const W = 300, H = 112, B = 18, gap = 8;
  const max = Math.max(1, ...list.map((w) => w.views));
  const bw = W / list.length;
  const last = list.at(-1);
  return `<figure class="d-chart has-read"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lượt xem ${list.length} kỳ gần nhất">
    <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="5" class="hatch-line"/></pattern></defs>
    ${list.map((w, i) => {
      const h = w.views ? Math.max(3, (w.views / max) * (H - B - 14)) : 0;
      const x = i * bw + gap / 2;
      const on = i === list.length - 1;
      return `<g class="wk${on ? ' on' : ''}${w.partial ? ' partial' : ''}" style="--i:${i}"${readAttr(`<b>${KIND[w.kind][0]} ${periodName(w)}</b> · ${n(w.views)} lượt xem · ${w.posts} bài · ${w.hits} hit`)}>
        ${h ? `<rect x="${x}" y="${H - B - h}" width="${bw - gap}" height="${h}" rx="4"/>` : `<rect x="${x}" y="${H - B - 1}" width="${bw - gap}" height="1" class="none"/>`}
        <text x="${x + (bw - gap) / 2}" y="${H - 4}" text-anchor="middle">${periodShort(w)}</text>
        <rect x="${i * bw}" y="0" width="${bw}" height="${H}" class="hit-area"/></g>`;
    }).join('')}</svg>
    <p class="d-read">${KIND[last.kind][0]} trước ${k(list.at(-2)?.views)} lượt xem${last.partial ? ' · kỳ này chưa kết thúc' : ''}</p></figure>`;
}

// The pace ring: posts so far against what the plans asked for up to today (or the whole period once it ended).
function paceTile(w) {
  const ratio = w.due ? w.posts / w.due : 0;
  const short = Math.max(0, w.due - w.posts);
  return `<div class="d-ring"><svg viewBox="0 0 120 120" aria-hidden="true">${arc(60, 50, ratio, 'pr')}</svg>
    <p><b data-count="${w.posts}">${w.posts}</b><span>/ ${w.due} bài</span></p></div>
    <p class="d-note ${short ? 'warn' : 'ok'}">${w.due ? short ? `Thiếu ${short} bài` : 'Đã đủ bài' : 'Chưa có mục tiêu'}</p>
    <p class="d-sub">${w.current ? `Mục tiêu đến nay: ${w.due} · cả kỳ ${w.target}` : `Cả kỳ cần ${w.target}`}</p>`;
}

// One day for the team: each person's tick, cross or progress, the same marks as Hoạt động.
function todayTile(m, day) {
  const list = m.members.map((mem) => ({ mem, q: m.quests.day(mem.id, day) })).filter((x) => !['before', 'future'].includes(x.q.status));
  const counted = list.filter((x) => x.q.status !== 'rest');
  const met = counted.filter((x) => x.q.status === 'met').length;
  return `<p class="d-big"><b data-count="${met}">${met}</b><span>/ ${counted.length} người đủ bài</span></p>
    <ul class="d-people">${list.map(({ mem, q }) => `<li><a href="#/bang-vang/${esc(mem.id)}" title="${esc(dayText(mem, q))}">${dayMark(q)}
      <small>${esc(firstName(mem.name))}</small>${dayCounts(q)}</a></li>`).join('')}</ul>`;
}

// The chain as a calendar, Monday first: a run of days with posts joins into one gold band; a day on which every member
// met her plan is a solid gold coin. Days outside the period stay faint.
function chainHtml(days) {
  const cells = days.map((d, i) => {
    const col = i % 7;
    const l = d.on && col > 0 && days[i - 1]?.on;
    const r = d.on && col < 6 && days[i + 1]?.on;
    const cls = ['cc-d', d.on && 'on', l && 'l', r && 'r', d.all && 'all', d.today && 'today', d.future && 'future', d.outside && 'outside'].filter(Boolean).join(' ');
    const read = d.future ? `<b>${weekday(d.day)} ${dm(d.day)}</b> · chưa tới` : `<b>${weekday(d.day)} ${dm(d.day)}</b> · ${d.posts} bài · ${d.of ? `${d.met}/${d.of} người đủ bài` : 'không ai có mục tiêu'}`;
    return `<button type="button" class="${cls}" style="--i:${i}"${readAttr(read)} aria-label="${esc(read.replace(/<[^>]+>/g, ''))}"><span>${+d.day.slice(8, 10)}</span></button>`;
  }).join('');
  return `<figure class="d-cal has-read"><div class="cc${days.length > 42 ? ' dense' : ''}">${WEEK.map((w) => `<span class="cc-h">${w}</span>`).join('')}${cells}</div>
    <p class="d-read"><span class="cc-key"><i class="k-band"></i>Ngày có bài, giữ chuỗi</span><span class="cc-key"><i class="k-coin"></i>Cả nhóm đủ bài</span></p></figure>`;
}

// Views or posts by publish day. Views stand on a square-root scale with labelled gridlines, since one hit day has 100
// times a normal day; posts stack seeding under creative, with the team's plan as a step line.
function dailyChart(m, series, p, mode) {
  const W = 560, H = 230, T = 14, B = 22, L = 30, gap = series.length > 40 ? 1 : 2;
  const bw = (W - L) / series.length;
  const inP = (d) => d.day >= p.from && d.day <= p.to;
  const every = series.length > 40 ? 14 : 7;
  const label = (i, x) => i % every === every - 1 || i === series.length - 1 ? `<text x="${x + (bw - gap) / 2}" y="${H - 6}" text-anchor="middle">${dm(series[i].day)}</text>` : '';
  const hit = (i) => `<rect x="${L + i * bw}" y="0" width="${bw}" height="${H}" class="hit-area"/>`;
  const width = Math.max(1, bw - gap);
  let marks = '';
  let grid = '';
  if (mode === 'views') {
    const max = Math.max(1, ...series.map((d) => d.views));
    const y = (v) => (Math.sqrt(v) / Math.sqrt(max)) * (H - T - B);
    grid = [1_000, 10_000, 100_000, 1_000_000].filter((t) => t <= max).slice(-3)
      .map((t) => `<line x1="${L}" x2="${W}" y1="${H - B - y(t)}" y2="${H - B - y(t)}" class="grid"/><text x="0" y="${H - B - y(t) + 3}" class="tick">${k(t)}</text>`).join('');
    marks = series.map((d, i) => {
      const h = d.views ? Math.max(3, y(d.views)) : 0;
      const x = L + i * bw + gap / 2;
      const best = d.best ? ` · cao nhất ${esc(firstName(d.best.member.name))} ${k(d.best.views)}` : '';
      return `<g class="db${inP(d) ? ' on' : ''}" style="--i:${i}"${readAttr(`<b>${weekday(d.day)} ${dm(d.day)}</b> · ${d.posts} bài · ${n(d.views)} lượt xem${best}`)}>
        ${h ? `<rect x="${x}" y="${H - B - h}" width="${width}" height="${h}" rx="${bw > 8 ? 3 : 1}"/>` : `<rect x="${x}" y="${H - B - 1}" width="${width}" height="1" class="none"/>`}
        ${d.best?.views >= HIT ? `<circle cx="${x + width / 2}" cy="${H - B - h - 7}" r="2.6" class="dot"/>` : ''}${label(i, x)}${hit(i)}</g>`;
    }).join('');
  } else {
    const want = series.map((d) => m.members.reduce((s, mem) => {
      const q = m.quests.day(mem.id, d.day);
      return s + (['before', 'future'].includes(q.status) ? 0 : q.target.seeding + q.target.creative);
    }, 0));
    const max = Math.max(1, ...series.map((d) => d.posts), ...want);
    const y = (v) => (v / max) * (H - T - B);
    grid = [...new Set([Math.ceil(max / 2), max])].map((t) => `<line x1="${L}" x2="${W}" y1="${H - B - y(t)}" y2="${H - B - y(t)}" class="grid"/><text x="0" y="${H - B - y(t) + 3}" class="tick">${t}</text>`).join('');
    marks = series.map((d, i) => {
      const x = L + i * bw + gap / 2;
      const hs = y(d.seeding);
      const hc = y(d.creative);
      return `<g class="db${inP(d) ? ' on' : ''}" style="--i:${i}"${readAttr(`<b>${weekday(d.day)} ${dm(d.day)}</b> · ${d.seeding} seeding · ${d.creative} sáng tạo · mục tiêu ${want[i]}`)}>
        ${hs ? `<rect x="${x}" y="${H - B - hs}" width="${width}" height="${hs}" rx="2"/>` : ''}
        ${hc ? `<rect x="${x}" y="${H - B - hs - hc - (hs ? 2 : 0)}" width="${width}" height="${hc}" rx="2" class="cr"/>` : ''}
        ${!hs && !hc ? `<rect x="${x}" y="${H - B - 1}" width="${width}" height="1" class="none"/>` : ''}${label(i, x)}${hit(i)}</g>`;
    }).join('');
    marks += `<path d="${want.map((v, i) => `${i ? 'L' : 'M'}${L + i * bw},${H - B - y(v)} L${L + (i + 1) * bw},${H - B - y(v)}`).join(' ')}" class="goal"/>`;
  }
  const rest = mode === 'posts' ? '<span class="cc-key"><i class="k-seed"></i>Seeding</span><span class="cc-key"><i class="k-cre"></i>Sáng tạo</span><span class="cc-key"><i class="k-goal"></i>Mục tiêu của nhóm</span>'
    : 'Chạm vào một cột để xem ngày đó · chấm vàng là ngày có hit';
  return `<figure class="d-daily has-read mode-${mode}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${mode === 'views' ? 'Lượt xem' : 'Số bài'} theo ngày đăng">
    ${grid}<line x1="${L}" x2="${W}" y1="${H - B + .5}" y2="${H - B + .5}" class="base"/>${marks}</svg><p class="d-read">${rest}</p></figure>`;
}

function bandsHtml(b) {
  const max = Math.max(1, ...b.bands.map((x) => x.n));
  const hits = b.bands.slice(2).reduce((s, x) => s + x.n, 0);
  return `<ul class="d-bands">${b.bands.map((x, i) => `<li class="b${i}"><span>${x.label}</span>
      <span class="d-bar"><i style="--w:${(x.n / max) * 100}%;--i:${i}"></i></span><b>${x.n}</b></li>`).join('')}</ul>
    <p class="d-sub">${b.posts ? `${Math.round((hits / b.posts) * 100)}% bài thành hit` : 'Chưa có bài trong kỳ'}</p>`;
}

function stockHtml(m, day) {
  if (!m.pool) return '<p class="d-sub">Chưa tải được kho bài.</p>';
  const perDay = m.members.reduce((s, mem) => s + m.quests.day(mem.id, day).target.seeding, 0);
  const days = perDay ? Math.floor(m.pool.length / perDay) : null;
  const low = days != null && days < 7;
  return `<p class="d-big"><b data-count="${m.pool.length}">${m.pool.length}</b><span>bài trong kho</span></p>
    <span class="d-bar wide${low ? ' low' : ''}"><i style="--w:${Math.min(100, ((days ?? 0) / 30) * 100)}%"></i><em style="left:${(7 / 30) * 100}%"></em></span>
    <p class="d-note ${low ? 'warn' : 'ok'}">${days == null ? 'Hôm nay không ai cần bài seeding' : low ? `Chỉ đủ đăng ${days} ngày, cần thêm bài` : `Đủ đăng khoảng ${days} ngày`}</p>`;
}

function dashHtml(base, s) {
  // Every tile reads the chosen kind's posts against that kind's plan; Kho bài stays the seeding cards' stock.
  const kind = s.dashKind;
  const m = { ...base, rows: ofKind(base.rows, kind), quests: questsOf(base.quests, kind) };
  const p = s.period;
  const w = teamWeek(m.rows, m.members, p, m.today, m.quests);
  const end = min(p.to, m.today);
  const all = teamAllTime(m.rows);
  const prev = prevPeriod(p);
  const next = nextPeriod(p);
  const label = w.current ? `${KIND[p.kind][0]} này` : next.from <= m.today && nextPeriod(next).from > m.today ? `${KIND[p.kind][0]} trước` : KIND[p.kind][0];
  const from = p.kind === 'week' ? addDays(end, -27) : p.from;
  const calFrom = p.kind === 'week' ? addDays(p.from, -21) : p.from;
  const seg = (kind) => `<button type="button" data-kind="${kind}" aria-pressed="${p.kind === kind}">${KIND[kind][0]}</button>`;
  return `<section class="stage bv-dash${s.folded ? ' is-folded' : ''}" aria-label="Tổng quan nhóm">
    <div class="dash-top">
      <div class="dash-title"><p class="eyebrow">Tổng quan nhóm${kind === 'all' ? '' : ` · bài ${kind === 'seeding' ? 'seeding' : 'sáng tạo'}`}</p><h2>${label}<span>${periodName(p)}</span></h2></div>
      <div class="dash-ctl">
        ${kindSwitch('dash-kind', kind, { dark: true })}
        <div class="seg dark" role="group" aria-label="Xem theo">${seg('week')}${seg('month')}${seg('quarter')}</div>
        <div class="bv-weeknav" role="group" aria-label="Chọn kỳ">
          <button type="button" data-go="${prev.from}" ${prev.to >= m.first ? '' : 'disabled'} aria-label="${KIND[p.kind][0]} trước">${icon('left')}</button>
          <button type="button" data-go="${next.from}" ${next.from <= m.today ? '' : 'disabled'} aria-label="${KIND[p.kind][0]} sau">${icon('right')}</button>
        </div>
      </div>
    </div>
    <div class="d-grid">
      <article class="d-tile t-views"><h3>Lượt xem</h3>
        <p class="d-hero"><b data-count="${w.views}" data-fmt="k">${k(w.views)}</b></p>
        ${periodsChart(periodSeries(m.rows, p, m.today, p.kind === 'week' ? 8 : p.kind === 'month' ? 6 : 4))}</article>
      <article class="d-tile t-pace"><h3>Tiến độ đăng</h3>${paceTile(w)}</article>
      <article class="d-tile t-today"><h3>${end === m.today ? 'Hôm nay' : `Ngày ${dm(end)}`}</h3>${todayTile(m, end)}</article>
      ${s.folded ? '' : `<article class="d-tile t-chain"><div class="d-head"><h3>Chuỗi của nhóm</h3>
            <p class="d-big">${icon('flame')}<b data-count="${w.streak.current}">${w.streak.current}</b><span>ngày liền có bài · dài nhất ${w.streak.longest}</span></p></div>
          ${chainHtml(chain(m.rows, m.members, m.quests, calFrom, p.to, m.today))}</article>
        <article class="d-tile t-daily"><div class="d-head"><h3>Theo ngày đăng</h3>
            <div class="seg dark" role="group" aria-label="Chọn số liệu"><button type="button" data-chart="views" aria-pressed="${s.chart === 'views'}">Lượt xem</button><button type="button" data-chart="posts" aria-pressed="${s.chart === 'posts'}">Số bài</button></div></div>
          ${dailyChart(m, dailySeries(m.rows, from, p.kind === 'week' ? end : p.to), p, s.chart)}</article>
        <article class="d-tile t-bands"><h3>Bài theo lượt xem</h3>${bandsHtml(viewBands(m.rows, p.from, end))}</article>
        <article class="d-tile t-stock"><h3>Kho bài</h3>${stockHtml(base, end)}</article>`}
    </div>
    <div class="dash-foot">
      <p class="bv-alltime">Từ ${all.since ? dm(all.since) : '–'}: <b>${n(all.posts)}</b> bài · <b>${k(all.views)}</b> lượt xem · <b>${all.hits}</b> hit · <b>${all.megas}</b> siêu hit</p>
      <button type="button" class="dash-fold" data-fold aria-expanded="${!s.folded}">${s.folded ? 'Xem tất cả số liệu' : 'Thu gọn'}${icon(s.folded ? 'down' : 'up')}</button>
    </div>
  </section>`;
}

/* ---------- Hoạt động: each member's days against her plan ---------- */

// One day of one member: a gold coin with a tick when she met her plan, a red coin with a cross when she missed it, a
// ring with her count while today runs, a dash on a rest day. A gold +n on the coin counts her posts over the plan.
function dayMark(q) {
  const want = q.target.seeding + q.target.creative;
  const got = q.seeding + q.creative;
  const inner = q.status === 'met' ? icon('check') : q.status === 'missed' ? '<span>×</span>'
    : q.status === 'open' ? `<svg viewBox="0 0 40 40" aria-hidden="true">${arc(20, 17, want ? got / want : 0, 'qo')}</svg><span>${got}</span>`
      : q.status === 'rest' ? '<span>–</span>' : '';
  return `<span class="dm s-${q.status}${q.wait?.length ? ' has-wait' : ''}">${inner}${q.extra ? `<em class="dm-x">+${q.extra}</em>` : ''}</span>`;
}

// Seeding is a gold dot and creative a dark diamond, the same in every cell, panel and key, so the two kinds read apart
// at a glance and without color.
const KINDS = [['seeding', 'Seeding', 'seed'], ['creative', 'Sáng tạo', 'cre']];
const glyph = (cls) => `<i class="kg ${cls}" aria-hidden="true"></i>`;
const kindList = (o) => KINDS.filter(([key]) => o[key]).map(([key, label, cls]) => `<span class="kn">${glyph(cls)}${o[key]} ${label.toLowerCase()}</span>`).join('');

// One kind's count on a day: done, still to do today, short (red) once the day is over, or over the plan (gold). A kind
// the plan does not ask for shows only when she posted it anyway, as +n.
function kindCount(q, key, cls) {
  const got = q[key];
  const want = q.target[key];
  if (!got && !want) return '';
  const state = got > want ? 'over' : got === want ? 'ok' : q.status === 'open' ? 'todo' : 'short';
  return `<span class="kc ${state}">${glyph(cls)}${want ? `${got}/${want}` : `+${got}`}</span>`;
}
function dayCounts(q) {
  if (['before', 'future'].includes(q.status)) return '';
  const parts = KINDS.map(([key, , cls]) => kindCount(q, key, cls)).join('');
  return `<span class="kcs">${parts || '<span class="kc rest">nghỉ</span>'}</span>`;
}
function dayText(mem, q) {
  const say = { met: 'đủ bài', missed: 'thiếu bài', open: 'chưa đủ bài', rest: 'ngày nghỉ', before: 'chưa vào nhóm', future: 'chưa tới' }[q.status];
  return `${mem.name}, ${weekday(q.day)} ${dm(q.day)}: ${say}. Seeding ${q.seeding}/${q.target.seeding}, sáng tạo ${q.creative}/${q.target.creative}${q.extra ? `, thêm ${q.extra} bài` : ''}${q.wait.length ? `, ${q.wait.length} bài chờ lần đọc tiếp theo` : ''}.`;
}

// Her live seeding accounts with no post on the day, so a missing seeding post names the account it should come from.
function idleAccounts(m, memberId, q) {
  const used = new Set([...q.posts.map((r) => r.account_id), ...q.wait.map((w) => w.account_id)].filter(Boolean));
  return m.team.accounts.filter((a) => a.member_id === memberId && a.kind === 'card' && a.active !== false
    && !/^[a-z]+\.(1|2|creative)$/.test(a.handle) && !used.has(a.id));
}

// One day opened: a lane per kind. Each lane has a pip per post the plan asks for (filled when posted, dashed while
// missing, gold for each post over the plan), then her posts, then an empty slot for each post still missing.
function dayDetail(m, memberId, day) {
  const q = m.quests.day(memberId, day);
  const mem = m.members.find((x) => x.id === memberId);
  const time = (iso) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const item = (r) => `<li><span class="qx-text"><b>@${esc(r.account.handle)} · ${time(r.published_at)}</b><span>${esc(r.op)}</span></span>
      ${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">${k(r.views)} xem</a>` : ''}</li>`;
  const wait = (w) => `<li class="is-wait"><span class="qx-text"><b>Chờ lần đọc tiếp theo</b><span>${w.kind === 'creative' ? 'Đã tạo link bài sáng tạo' : 'Đã bấm "Đã đăng xong"'}</span></span></li>`;
  const late = q.status === 'open' ? 'Chưa đăng' : 'Không đăng';
  const idle = idleAccounts(m, memberId, q);
  const lane = ([key, label, cls]) => {
    const got = q[key];
    const want = q.target[key];
    if (!got && !want) return '';
    const pips = Array.from({ length: Math.min(12, Math.max(got, want)) }, (_, i) =>
      `<i class="pip ${i >= want ? 'over' : i < got ? 'on' : 'off'}"></i>`).join('');
    const slots = Array.from({ length: q.short[key] }, (_, i) => {
      const account = key === 'seeding' ? idle[i] : null;
      return `<li class="qx-slot"><span class="qx-text"><b>${late}</b><span>${account ? `@${esc(account.handle)} chưa có bài` : `Một bài ${label.toLowerCase()}`}</span></span></li>`;
    }).join('');
    const posts = q.posts.filter((r) => r.creative === (key === 'creative')).map(item).join('');
    const waits = q.wait.filter((w) => w.kind === key).map(wait).join('');
    const state = got > want ? 'over' : got >= want ? 'ok' : q.status === 'open' ? 'todo' : 'short';
    return `<section class="qx-lane ${cls}"><header>${glyph(cls)}<b>${label}</b><span class="qx-n ${state}">${want ? `${got}/${want}` : `+${got}`}</span>
      <span class="pips" aria-hidden="true">${pips}</span></header><ul>${posts}${waits}${slots}</ul></section>`;
  };
  const lanes = KINDS.map(lane).join('');
  const verdict = q.status === 'met' ? `Đủ bài${q.extra ? `, thêm ${q.extra} bài · +${q.extra * XP.extra} XP` : ''}`
    : q.status === 'rest' ? (q.extra ? `Ngày nghỉ, vẫn đăng ${q.extra} bài · +${q.extra * XP.extra} XP` : 'Ngày nghỉ')
      : q.status === 'before' ? 'Chưa vào nhóm' : q.status === 'future' ? 'Chưa tới'
        : `${q.status === 'open' ? 'Còn thiếu' : 'Thiếu'} ${kindList(q.short)}`;
  return `<div class="qx" role="region" aria-label="Bài của ${esc(mem.name)} ngày ${dm(day)}">
    <header>${dayMark(q)}<div><b>${esc(firstName(mem.name))} · ${weekday(day)} ${dm(day)}</b><span class="qx-verdict s-${q.status}">${verdict}</span></div>
      <button type="button" class="qx-close" data-close aria-label="Đóng">${icon('close')}</button></header>
    ${lanes ? `<div class="qx-lanes">${lanes}</div>` : '<p class="qx-none">Ngày nghỉ, không có bài.</p>'}
  </div>`;
}

// Members ranked by the share of days they met, then by days met. A day not counted (rest, before, future) is left out.
function questRank(m, days) {
  return m.members.map((mem) => {
    const qs = days.map((d) => m.quests.day(mem.id, d));
    const counted = qs.filter((q) => ['met', 'missed'].includes(q.status));
    const met = counted.filter((q) => q.status === 'met').length;
    return { mem, qs, met, of: counted.length, rate: counted.length ? met / counted.length : -1, extra: qs.reduce((a, q) => a + q.extra, 0) };
  }).sort((a, b) => b.rate - a.rate || b.met - a.met || a.mem.name.localeCompare(b.mem.name));
}

// The period's totals of one member up to today: posts of each kind against the plan, what the missed days lacked and
// the posts over the plan.
function periodTotals(x) {
  const qs = x.qs.filter((q) => !['before', 'future'].includes(q.status));
  const add = (f) => qs.reduce((a, q) => a + f(q), 0);
  return { seeding: add((q) => q.seeding), creative: add((q) => q.creative),
    want: { seeding: add((q) => q.target.seeding), creative: add((q) => q.target.creative) },
    short: { seeding: add((q) => q.status === 'missed' ? q.short.seeding : 0), creative: add((q) => q.status === 'missed' ? q.short.creative : 0) },
    extra: add((q) => q.extra) };
}

// Under her name, what a manager checks first: what today still lacks, by kind. For a past period, what its missed
// days lacked; for a period not started, the plan of its first day.
function needLine(m, x, days) {
  const extra = (e) => e ? `<span class="kn over">+${e} bài thêm</span>` : '';
  if (days.includes(m.today)) {
    const q = m.quests.day(x.mem.id, m.today);
    if (q.status === 'open') return `<small class="qw-need todo">Hôm nay thiếu ${kindList(q.short)}</small>`;
    if (q.status === 'met') return `<small class="qw-need ok">Hôm nay đủ bài ${extra(q.extra)}</small>`;
    if (q.status === 'rest') return `<small class="qw-need">Hôm nay nghỉ ${extra(q.extra)}</small>`;
    return '<small class="qw-need">Chưa vào nhóm</small>';
  }
  if (days[0] > m.today) {
    const t = m.quests.day(x.mem.id, days[0]).target;
    return `<small class="qw-need">${t.seeding + t.creative ? `Ngày đầu cần ${kindList(t)}` : 'Ngày đầu nghỉ'}</small>`;
  }
  const t = periodTotals(x);
  return t.short.seeding + t.short.creative ? `<small class="qw-need short">Thiếu ${kindList(t.short)} ${extra(t.extra)}</small>`
    : `<small class="qw-need ok">${x.of ? 'Đủ bài mọi ngày' : 'Chưa có dữ liệu'} ${extra(t.extra)}</small>`;
}

const sumCell = (x) => `<span class="qw-sum" role="cell"><span><b>${x.met}</b><small>/${x.of}<span class="qw-unit"> ngày</span></small></span>${x.extra ? `<em>+${x.extra} bài</em>` : ''}</span>`;

// A week: one row per member, a day per column, a mark and a count per kind in each cell; a tap opens the day under
// the table.
function weekBoard(m, s, days) {
  const ranked = questRank(m, days);
  const open = s.open && days.includes(s.open.day) ? s.open : null;
  return `<div class="qw" role="table" aria-label="Từng người, từng ngày">
    <div class="qw-row qw-head" role="row"><span role="columnheader"></span><span role="columnheader">Thành viên</span>
      ${days.map((d) => `<span role="columnheader" class="${d === m.today ? 'today' : ''}">${weekday(d)}<small>${dm(d)}</small></span>`).join('')}<span role="columnheader">Ngày đủ</span></div>
    ${ranked.map((x, i) => {
      const p = m.profiles.get(x.mem.id);
      return `<div class="qw-row" role="row" data-member="${esc(x.mem.id)}" style="--i:${i}">
        <span class="qw-place" role="cell">${x.of ? i + 1 : '–'}</span>
        <a class="qw-who" role="rowheader" href="#/bang-vang/${esc(x.mem.id)}">${avatar(p, 36)}<span><b>${esc(firstName(x.mem.name))}${flame(p.quest, false, `${p.quest} ngày liền đủ bài`)}</b>${needLine(m, x, days)}</span></a>
        ${x.qs.map((q) => `<span role="cell" class="qw-c${q.day === m.today ? ' today' : ''}">${['before', 'future'].includes(q.status) ? `<span class="dm s-${q.status}"></span>`
          : `<button type="button" class="qw-b${open?.member === x.mem.id && open.day === q.day ? ' is-open' : ''}" data-cell="${q.day}" aria-label="${esc(dayText(x.mem, q))}">${dayMark(q)}${dayCounts(q)}</button>`}</span>`).join('')}
        ${sumCell(x)}
      </div>`;
    }).join('')}
  </div>
  ${open ? dayDetail(m, open.member, open.day) : ''}`;
}

// A month or a quarter: one card per member with her days as a small calendar, weeks as rows, and her totals by kind.
function periodCards(m, s, days) {
  const ranked = questRank(m, days);
  const blank = Array.from({ length: mondayGap(days[0]) }, () => '<span class="mc-d s-none"></span>').join('');
  return `<div class="mc-grid">${ranked.map((x, i) => {
    const p = m.profiles.get(x.mem.id);
    const t = periodTotals(x);
    const total = KINDS.filter(([key]) => t.want[key] || t[key]).map(([key, label, cls]) => {
      const state = t[key] > t.want[key] ? 'over' : t.short[key] ? 'short' : 'ok';
      return `<span class="kc ${state}">${glyph(cls)}${label} <b>${t.want[key] ? `${t[key]}/${t.want[key]}` : `+${t[key]}`}</b></span>`;
    }).join('');
    return `<article class="mc" data-member="${esc(x.mem.id)}" style="--i:${i}">
      <header><span class="qw-place">${x.of ? i + 1 : '–'}</span><a class="qw-who" href="#/bang-vang/${esc(x.mem.id)}">${avatar(p, 34)}<span><b>${esc(firstName(x.mem.name))}</b><small>${x.of ? `${Math.round((x.met / x.of) * 100)}% ngày đủ bài` : 'Chưa có dữ liệu'}</small></span></a>
        ${sumCell(x)}</header>
      <div class="mc-cal">${WEEK.map((w) => `<span class="mc-h">${w}</span>`).join('')}${blank}${x.qs.map((q) => `<button type="button" class="mc-d s-${q.status}${q.day === m.today ? ' today' : ''}${s.open?.member === x.mem.id && s.open.day === q.day ? ' is-open' : ''}" data-cell="${q.day}" aria-label="${esc(dayText(x.mem, q))}" title="${esc(dayText(x.mem, q))}">${q.extra ? '<i>+</i>' : ''}</button>`).join('')}</div>
      ${total ? `<p class="mc-sum">${total}</p>` : ''}
      ${t.short.seeding + t.short.creative ? `<p class="mc-need">Thiếu ${kindList(t.short)}</p>` : ''}
    </article>`;
  }).join('')}</div>
  ${s.open && days.includes(s.open.day) ? dayDetail(m, s.open.member, s.open.day) : ''}`;
}

// Each member's posts in the period, seeding and creative stacked, against her plan up to today.
function countsChart(m, days) {
  const list = m.members.map((mem) => {
    const qs = days.filter((d) => d <= m.today).map((d) => m.quests.day(mem.id, d)).filter((q) => q.status !== 'before');
    return { mem, s: qs.reduce((a, q) => a + q.seeding, 0), c: qs.reduce((a, q) => a + q.creative, 0), want: qs.reduce((a, q) => a + q.target.seeding + q.target.creative, 0) };
  }).sort((a, b) => b.s + b.c - (a.s + a.c));
  const max = Math.max(1, ...list.map((x) => Math.max(x.s + x.c, x.want)));
  return `<ul class="qc-list">${list.map((x, i) => `<li style="--i:${i}"><span class="qc-name">${esc(firstName(x.mem.name))}</span>
      <span class="qc-bar" title="${esc(`${x.mem.name}: ${x.s} seeding, ${x.c} sáng tạo, mục tiêu ${x.want}`)}"><i class="s" style="--w:${(x.s / max) * 100}%"></i><i class="c" style="--w:${(x.c / max) * 100}%"></i>${x.want ? `<em style="left:${(x.want / max) * 100}%"></em>` : ''}</span>
      <span class="qc-n"><b>${x.s + x.c}</b>/${x.want}</span></li>`).join('')}</ul>
    <p class="qc-key"><span class="cc-key"><i class="k-seed"></i>Seeding</span><span class="cc-key"><i class="k-cre dark"></i>Sáng tạo</span><span class="cc-key"><i class="k-mark"></i>Mục tiêu đến hôm nay</span></p>`;
}

function activityHtml(m, s) {
  const p = s.period;
  const days = periodDays(p);
  const sample = (status, seeding, extra = 0) => ({ status, target: { seeding: 2, creative: 0 }, seeding, creative: 0, wait: [], extra });
  return `<section class="bv-act" aria-label="Hoạt động">
    <div class="bv-quests">
      <header class="bq-head"><div><h2>Tiến độ mỗi ngày</h2><p class="bq-sub">${p.kind === 'week' ? 'Tuần ' : ''}${periodName(p)} · xếp theo tỷ lệ ngày đủ bài</p></div>
        ${m.manager ? '<a class="bq-set" href="#/cai-dat" data-set-target="*">Đặt mục tiêu</a>' : ''}</header>
      <div class="bq-key"><span class="bq-marks"><span>${dayMark(sample('met', 2))}Đủ bài</span><span>${dayMark(sample('missed', 1))}Thiếu bài</span><span>${dayMark(sample('open', 1))}Hôm nay</span><span>${dayMark(sample('met', 3, 1))}Đăng thêm</span></span>
        <span class="bq-kinds">${KINDS.map(([, label, cls]) => `<span>${glyph(cls)}${label}</span>`).join('')}<span><b class="kc short">0/1</b>còn thiếu</span></span></div>
      ${p.kind === 'week' ? weekBoard(m, s, days) : periodCards(m, s, days)}
      <p class="bq-foot">${p.kind === 'week' ? 'Mỗi ô là số bài đã đăng / mục tiêu, tách seeding và sáng tạo. ' : ''}Chạm vào một ngày để xem bài nào đã đăng, bài nào còn thiếu. Bài chờ lần đọc tiếp theo được tính ngay. Mỗi ngày đủ bài +${XP.quest} XP, mỗi bài đăng thêm +${XP.extra} XP.</p>
    </div>
    <div class="bv-act-side">
      <section class="bv-panel"><header><h2>Số bài theo người</h2><small>${periodName(p)}</small></header>${countsChart(m, days)}</section>
      ${alertsHtml(m)}
    </div>
  </section>`;
}

/* ---------- Thi đua: crowns, leaderboard, hall of fame, the feed ---------- */

function crownsHtml(m, s) {
  const p = s.period;
  const c = crowns(m.rows, m.members, p, m.today, m.quests);
  const word = KIND[p.kind][1];
  const verb = c.done ? 'Vô địch' : 'Đang dẫn';
  const keen = [...c.table].sort((a, b) => b.extra - a.extra || a.place - b.place)[0];
  const side = [
    c.leader && [`${verb} ${word}`, c.leader.member, `${n(c.leader.xp)} XP · ${c.leader.posts} bài`],
    c.streak && ['Chuỗi đăng dài nhất', c.streak.member, `${c.streak.days} ngày liền`],
    keen?.extra && ['Đăng thêm nhiều nhất', keen.member, `+${keen.extra} bài ngoài mục tiêu`],
    c.climber && ['Thăng hạng nhiều nhất', c.climber.member, `Tăng ${c.climber.move} hạng so với ${word} trước`],
  ].filter(Boolean);
  const best = c.best ? `<div class="bv-best"><p class="bv-label">${icon('trophy')}Bài của ${word}${c.done ? '' : ' · tạm tính'}</p>${postHtml(m, c.best, { feature: true })}</div>`
    : `<div class="bv-best empty-best"><p class="bv-label">${icon('trophy')}Bài của ${word}</p><p>Chưa có dữ liệu của ${word} này. Bài đăng đầu tiên có lượt xem sẽ xuất hiện ở đây.</p></div>`;
  return `<section class="bv-crowns" aria-label="Danh hiệu">${best}
    <ol class="bv-crown-list">${side.map(([title, member, line], i) => `<li style="--i:${i}"><a href="#/bang-vang/${esc(member.id)}">
      ${avatar(m.profiles.get(member.id), 46)}
      <span><small>${esc(title)}</small><b>${esc(firstName(member.name))}</b><em>${esc(line)}</em></span></a></li>`).join('')}
      ${side.length ? '' : `<li class="bv-crown-none">Chưa ai có danh hiệu ${word} này.</li>`}</ol>
  </section>`;
}

// The leaderboard's period: the page's, unless she picked another kind on the board itself, then that kind around the
// same day.
const boardPeriod = (m, s) => s.lbKind && s.lbKind !== s.period.kind ? periodOf(s.lbKind, min(s.period.to, m.today)) : s.period;

function boardHtml(m, s) {
  const p = boardPeriod(m, s);
  const { table } = crowns(m.rows, m.members, p, m.today, m.quests);
  const top = table[0]?.xp || 1;
  const row = (x, i) => {
    const p = m.profiles.get(x.member.id);
    return `<li class="${x.place <= 3 && x.xp ? `p${x.place}` : ''}" style="--i:${i}"><a href="#/bang-vang/${esc(x.member.id)}">
      <span class="bv-place">${x.place}</span>${avatar(p, 42)}
      <span class="bv-name"><b>${esc(firstName(x.member.name))}</b><small>${esc(p.level.title)} · cấp ${p.level.n}</small>
        <span class="bv-xpbar" aria-hidden="true"><i style="--w:${(x.xp / top) * 100}%"></i></span></span>
      <span class="bv-score"><b>${n(x.xp)}</b><small>XP</small></span></a>
      <p class="bv-line">${move(x.move)}${flame(p.streak.current, p.streak.atRisk, p.streak.atRisk ? 'Chưa đăng hôm nay' : 'Ngày liền có bài')}<span>${x.posts} bài · ${k(x.views)} lượt xem · đủ bài ${x.met} ngày${x.extra ? ` · <em>+${x.extra} bài thêm</em>` : ''}</span></p></li>`;
  };
  // Its own switch: it changes only this board, in place, like every other switch in Studio (Nam, 2026-11-04).
  const seg = (kind) => `<button type="button" data-lb-kind="${kind}" aria-pressed="${p.kind === kind}">${KIND[kind][0]}</button>`;
  return `<section class="bv-panel bv-lb">
    <header><div><h2>Bảng xếp hạng ${KIND[p.kind][1]}</h2><small>${periodName(p)}</small></div>
      <div class="seg sm" role="group" aria-label="Xếp hạng theo">${seg('week')}${seg('month')}${seg('quarter')}</div></header>
    <ol>${table.map(row).join('')}</ol>
    <details class="bv-rules"><summary>Cách tính XP</summary>
      <ul><li><b>+${XP.post}</b> mỗi bài đăng</li><li><b>+${XP.day}</b> mỗi ngày có bài</li><li><b>+${XP.quest}</b> mỗi ngày đủ bài theo mục tiêu</li>
      <li><b>+${XP.extra}</b> mỗi bài đăng thêm ngoài mục tiêu, vào ngày đủ bài hoặc ngày nghỉ</li>
      <li><b>+${XP.beat}</b> khi bài gấp ${BEAT} lần mức xem thông thường của tài khoản</li>
      <li><b>+${XP.hit}</b> khi bài qua ${k(HIT)} lượt xem</li><li><b>+${XP.mega}</b> nữa khi qua ${k(MEGA)}</li></ul>
      <p>Mức xem thông thường là trung vị của tối đa 14 bài gần nhất trên cùng tài khoản. Bảng xếp hạng cập nhật sau mỗi lần đọc Threads, 6 tiếng một lần. Cần đạt 25, 100, 225, 400 XP... để lên các cấp tiếp theo.</p></details>
  </section>`;
}

const ALERT = { missing: 'Chưa thấy bài', target: 'Hôm qua thiếu bài', streak: 'Chuỗi sắp mất', quiet: 'Vắng', account: 'Tài khoản im ắng' };
function alertsHtml(m) {
  if (!m.manager) return '';
  const yesterday = addDays(m.today, -1);
  const missed = m.members.map((mem) => ({ mem, q: m.quests.day(mem.id, yesterday) })).filter((x) => x.q.status === 'missed')
    .map(({ mem, q }) => ({ kind: 'target', member: mem, text: `Thiếu ${[q.short.seeding && `${q.short.seeding} seeding`, q.short.creative && `${q.short.creative} sáng tạo`].filter(Boolean).join(' và ')}.` }));
  const list = [...alerts({ rows: m.rows, team: m.team, activity: m.activity, today: m.today, now: m.now }), ...missed];
  const order = { missing: 0, target: 1, streak: 2, quiet: 3, account: 4 };
  list.sort((a, b) => order[a.kind] - order[b.kind]);
  return `<section class="bv-panel bv-alerts">
    <header><h2>Cần lưu ý</h2><small>Chỉ quản lý thấy</small></header>
    ${list.length ? `<ul>${list.map((a) => `<li class="k-${a.kind}"><a href="#/bang-vang/${esc(a.member.id)}">
      <span class="al-kind">${ALERT[a.kind]}</span><span><b>${esc(firstName(a.member.name))}</b>${esc(a.text)}</span></a></li>`).join('')}</ul>`
      : '<p class="bv-calm">Chưa có gì cần lưu ý. Mọi người đều đang đăng bài.</p>'}
  </section>`;
}

function fameHtml(m) {
  const all = teamAllTime(m.rows);
  return `<section class="bv-panel bv-fame"><header><h2>Kỷ lục của nhóm</h2><small>Từ ${all.since ? dm(all.since) : '–'}</small></header>
    <ol>${all.top.map((r, i) => `<li><span class="bv-rank">${i + 1}</span><a href="${esc(r.source_url)}" target="_blank" rel="noopener">
      <b>${k(r.views)}</b><span>${esc(r.op)}</span><small>${esc(firstName(r.member.name))} · ${dm(r.day)}</small></a></li>`).join('')}</ol></section>`;
}

// The feed's period: its own once she steps it in the feed's toolbar, else the page's (Nam, 2026-11-04: changing the
// week meant scrolling all the way up).
const feedPeriod = (s) => s.feedPeriod ?? s.period;

function feedRows(m, s) {
  const p = feedPeriod(s);
  let list = ofKind(m.rows.filter((r) => r.day >= p.from && r.day <= p.to), s.feedKind);
  if (s.who) list = list.filter((r) => r.member.id === s.who);
  if (s.filter === 'hit') list = list.filter((r) => r.views >= HIT);
  if (s.filter === 'win') list = list.filter((r) => r.tier);
  return s.sort === 'views' ? [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    : [...list].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

// The title, the count and the order head the feed; a two-row bar stays pinned over the posts while she scrolls (Nam,
// 2026-11-04: the filters stacked five rows high). Its first row holds the period, its second every filter: the kind,
// Nổi bật and Hit as toggles, a person as a picker, and Xoá lọc once anything is set.
function feedHtml(m, s) {
  const p = feedPeriod(s);
  const list = feedRows(m, s);
  const inPeriod = m.rows.filter((r) => r.day >= p.from && r.day <= p.to);
  const ofK = ofKind(inPeriod, s.feedKind);
  const people = m.members.map((x) => ({ x, count: ofK.filter((r) => r.member.id === x.id).length })).filter((o) => o.count || o.x.id === s.who);
  const who = m.members.find((x) => x.id === s.who);
  const prev = prevPeriod(p);
  const next = nextPeriod(p);
  const span = (kind) => `<button type="button" data-fd-span="${kind}" aria-pressed="${p.kind === kind}">${KIND[kind][0]}</button>`;
  const chip = (value, label) => `<button type="button" class="fd-chip" data-fd-filter="${value}" aria-pressed="${s.filter === value}">${label}</button>`;
  const set = s.feedKind !== 'all' || s.filter !== 'all' || s.who;
  return `<section class="bv-feed" aria-label="Bài của cả nhóm">
    <header class="fd-head"><h2 class="bv-h">Bài của nhóm<small>${list.length} bài</small></h2>
      <label class="fd-pick"><select data-fd-sort aria-label="Sắp xếp"><option value="new"${s.sort === 'new' ? ' selected' : ''}>Mới nhất</option><option value="views"${s.sort === 'views' ? ' selected' : ''}>Xem nhiều</option></select>${icon('down')}</label></header>
    <div class="fd-bar">
      <div class="fd-period">
        <div class="seg sm" role="group" aria-label="Xem bài theo">${span('week')}${span('month')}${span('quarter')}</div>
        <div class="fd-step" role="group" aria-label="Chọn kỳ">
          <button type="button" data-fd-go="${prev.from}" ${prev.to >= m.first ? '' : 'disabled'} aria-label="${KIND[p.kind][0]} trước">${icon('left')}</button>
          <span>${periodName(p)}</span>
          <button type="button" data-fd-go="${next.from}" ${next.from <= m.today ? '' : 'disabled'} aria-label="${KIND[p.kind][0]} sau">${icon('right')}</button>
        </div>
      </div>
      <div class="fd-filters" role="toolbar" aria-label="Lọc bài">
        ${kindSwitch('fd-type', s.feedKind, { counts: kindCounts(inPeriod) })}
        <span class="fd-sep" aria-hidden="true"></span>
        ${chip('win', 'Nổi bật')}${chip('hit', 'Hit')}
        <label class="fd-pick${s.who ? ' on' : ''}"><span class="fd-av" aria-hidden="true">${who ? faceInner(who) : icon('team')}</span>
          <select data-fd-who aria-label="Lọc theo người"><option value="">Cả nhóm</option>${people.map(({ x, count }) => `<option value="${esc(x.id)}"${s.who === x.id ? ' selected' : ''}>${esc(firstName(x.name))} · ${count}</option>`).join('')}</select>${icon('down')}</label>
        ${set ? '<button type="button" class="fd-clear" data-fd-clear>Xoá lọc</button>' : ''}
      </div>
    </div>
    <div class="tp-list">${list.length ? list.slice(0, s.shown).map((r) => postHtml(m, r)).join('') : '<p class="bv-none">Không có bài nào khớp bộ lọc trong kỳ này.</p>'}</div>
    ${list.length > s.shown ? `<p class="bv-more"><button class="btn btn-line sm" type="button" data-fd-more>Xem thêm · còn ${list.length - s.shown}</button></p>`
      : prev.to >= m.first ? `<p class="bv-more"><button class="btn btn-line sm" type="button" data-fd-go="${prev.from}">${icon('left')}Sang ${KIND[prev.kind][1]} ${periodName(prev)}</button></p>` : ''}
  </section>`;
}

// A feed change redraws the feed alone. Made from the pinned toolbar down in the list, it shows the results from their
// top; made above the list, the page stays where it is. The control she used keeps the focus.
function paintFeed(main, m, s, patch, { top = true } = {}) {
  Object.assign(s, patch);
  const old = main.querySelector('.bv-feed');
  if (!old) return;
  const active = document.activeElement && old.contains(document.activeElement)
    ? [...document.activeElement.attributes].find((a) => a.name.startsWith('data-fd-')) : null;
  const key = active ? `[${active.name}${active.value ? `="${CSS.escape(active.value)}"` : ''}]` : null;
  const y = window.scrollY;
  const below = old.getBoundingClientRect().top < 0;
  old.outerHTML = feedHtml(m, s);
  const feed = main.querySelector('.bv-feed');
  wireFeed(main, m, s);
  if (top && below) feed.scrollIntoView({ block: 'start' }); else window.scrollTo(0, y);
  if (key) feed.querySelector(key)?.focus({ preventScroll: true });
}

function wireFeed(main, m, s) {
  const feed = main.querySelector('.bv-feed');
  if (!feed) return;
  const p = feedPeriod(s);
  const go = (patch, opts) => paintFeed(main, m, s, patch, opts);
  feed.querySelectorAll('[data-fd-span]').forEach((b) => { b.onclick = () => go({ feedPeriod: periodOf(b.dataset.fdSpan, min(p.to, m.today)), shown: PAGE }); });
  feed.querySelectorAll('[data-fd-go]').forEach((b) => { b.onclick = () => go({ feedPeriod: periodOf(p.kind, b.dataset.fdGo), shown: PAGE }); });
  feed.querySelectorAll('[data-fd-type]').forEach((b) => { b.onclick = () => go({ feedKind: b.dataset.fdType, shown: PAGE }); });
  feed.querySelectorAll('[data-fd-filter]').forEach((b) => { b.onclick = () => go({ filter: s.filter === b.dataset.fdFilter ? 'all' : b.dataset.fdFilter, shown: PAGE }); });
  feed.querySelector('[data-fd-who]').onchange = (e) => go({ who: e.target.value, shown: PAGE });
  feed.querySelector('[data-fd-sort]').onchange = (e) => go({ sort: e.target.value, shown: PAGE });
  const clear = feed.querySelector('[data-fd-clear]');
  if (clear) clear.onclick = () => go({ feedKind: 'all', filter: 'all', who: '', shown: PAGE });
  const more = feed.querySelector('[data-fd-more]');
  if (more) more.onclick = () => go({ shown: s.shown + PAGE }, { top: false });
}

function gameHtml(m, s) {
  return `${crownsHtml(m, s)}
    <div class="bv-grid">
      <aside class="bv-rail">${boardHtml(m, s)}${fameHtml(m)}</aside>
      ${feedHtml(m, s)}
    </div>`;
}

/* ---------- The page ---------- */

function setTargetLinks(root) {
  root.querySelectorAll('[data-set-target]').forEach((a) => a.addEventListener('click', () => {
    try { sessionStorage.setItem(FOCUS_KEY, a.dataset.setTarget); } catch { /* storage blocked */ }
  }));
}

// The leaderboard's own switch redraws that panel alone, so the page keeps its place and nothing else moves.
function wireBoardSwitch(main, m, s) {
  main.querySelectorAll('[data-lb-kind]').forEach((b) => b.addEventListener('click', () => {
    if (b.getAttribute('aria-pressed') === 'true') return;
    s.lbKind = b.dataset.lbKind;
    const old = main.querySelector('.bv-lb');
    const open = old.querySelector('.bv-rules')?.open;
    old.outerHTML = boardHtml(m, s);
    const lb = main.querySelector('.bv-lb');
    if (open) lb.querySelector('.bv-rules').open = true;
    // Only the new panel's buttons are left in the page, so wiring the page again wires just them.
    wireBoardSwitch(main, m, s);
    lb.querySelector(`[data-lb-kind="${s.lbKind}"]`)?.focus();
  }));
}

function paintBoard(main, m, s, first = false) {
  const tab = (view, label, sub) => `<button type="button" role="tab" data-view="${view}" aria-selected="${s.view === view}"><b>${label}</b><small>${sub}</small></button>`;
  main.innerHTML = `<div class="bv${first ? '' : ' is-still'}">
    ${dashHtml(m, s)}
    <div class="bv-switch" role="tablist" aria-label="Chọn phần">${tab('game', 'Thi đua', 'Xếp hạng và bài của nhóm')}${tab('activity', 'Hoạt động', 'Tiến độ mỗi ngày')}</div>
    <div class="bv-view" role="tabpanel">${s.view === 'activity' ? activityHtml(m, s) : gameHtml(m, s)}</div>
    <p class="bv-foot"><a class="linkish" href="#/so-lieu">${icon('stats')}Số liệu chi tiết</a><a class="linkish" href="#/nhom">${icon('team')}Lịch đăng theo ngày</a></p>
  </div>`;
  if (first) countUp(main);
  wireReadouts(main);
  setTargetLinks(main);
  const repaint = (patch) => {
    const y = window.scrollY;
    Object.assign(s, patch);
    paintBoard(main, m, s);
    window.scrollTo(0, y);
  };
  main.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    store.set('studio.board.kind', b.dataset.kind);
    repaint({ period: periodOf(b.dataset.kind, min(s.period.to, m.today)), shown: PAGE, open: null, lbKind: null, feedPeriod: null });
  }));
  main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    repaint({ period: periodOf(s.period.kind, b.dataset.go), shown: PAGE, open: null, lbKind: null, feedPeriod: null });
  }));
  wireBoardSwitch(main, m, s);
  main.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    store.set('studio.board.view', b.dataset.view);
    repaint({ view: b.dataset.view, open: null });
  }));
  main.querySelector('[data-fold]').addEventListener('click', () => {
    // Folded is the default (Nam, 2026-11-04); a new key, so a dashboard opened before starts folded once.
    store.set('studio.board.dashOpen', s.folded ? '1' : '0');
    repaint({ folded: !s.folded });
  });
  main.querySelectorAll('[data-chart]').forEach((b) => b.addEventListener('click', () => repaint({ chart: b.dataset.chart })));
  main.querySelectorAll('[data-dash-kind]').forEach((b) => b.addEventListener('click', () => {
    store.set('studio.board.dashKind', b.dataset.dashKind);
    repaint({ dashKind: b.dataset.dashKind });
  }));
  wireFeed(main, m, s);
  main.querySelectorAll('[data-cell]').forEach((b) => b.addEventListener('click', () => {
    const member = b.closest('[data-member]').dataset.member;
    const same = s.open?.member === member && s.open?.day === b.dataset.cell;
    repaint({ open: same ? null : { member, day: b.dataset.cell } });
    if (!same) main.querySelector('.qx')?.scrollIntoView({ block: 'nearest', behavior: still() ? 'auto' : 'smooth' });
  }));
  main.querySelector('[data-close]')?.addEventListener('click', () => repaint({ open: null }));
}

/* ---------- A member's profile ---------- */

function factHtml(f) {
  if (f.list) return `<li class="bv-fact"><b>${esc(f.title)}</b><ul class="bv-said">${f.list.map((t) => `<li><span>${esc(t.theme)}</span><em>${t.n}</em></li>`).join('')}</ul></li>`;
  const bars = f.a != null && f.b != null ? `<span class="bv-vs" aria-hidden="true"><i style="--w:${(f.a / Math.max(f.a, f.b)) * 100}%"></i><i style="--w:${(f.b / Math.max(f.a, f.b)) * 100}%"></i></span>` : '';
  return `<li class="bv-fact"><b>${esc(f.title)}</b>${bars}<p>${esc(f.detail)}</p></li>`;
}

// Six weeks of days, Monday first. Gold deepens with the day's views on a log scale; an empty day stays sand.
function calendarHtml(rows, today) {
  const days = calendar(rows, today);
  const max = Math.log10(Math.max(10, ...days.map((d) => d.views)));
  const shade = (v) => v ? Math.max(.18, Math.log10(Math.max(10, v)) / max) : 0;
  return `<div class="bv-cal" role="img" aria-label="Lịch đăng 6 tuần">
    ${WEEK.map((d) => `<span class="bv-cal-h">${d}</span>`).join('')}
    ${days.map((d, i) => `<span class="bv-cal-d${d.future ? ' future' : ''}${d.day === today ? ' today' : ''}${d.posts ? ' on' : ''}" style="--a:${shade(d.views).toFixed(2)};--i:${i}"
      title="${weekday(d.day)} ${dm(d.day)}: ${d.posts ? `${d.posts} bài · ${n(d.views)} lượt xem` : 'không có bài'}">${d.posts > 1 ? d.posts : ''}</span>`).join('')}
  </div><p class="bv-cal-key"><span>Không bài</span><i style="--a:0"></i><i style="--a:.3"></i><i style="--a:.65"></i><i style="--a:1"></i><span>Nhiều lượt xem</span></p>`;
}

// first is true only when the page opens; a sort tap, Xem thêm or a redraw paints still (Nam, 2026-11-04: it looked
// like the page reloaded on every tap of Xem nhiều).
// The kind switch reads her posts, views, hit rate, facts, calendar and week of one kind; XP, level, rank, streak and
// badges stay the whole game.
function paintProfile(main, m, id, view = { sort: 'views', shown: PAGE, kind: 'all' }, first = false) {
  const { sort, shown, kind = 'all' } = view;
  const p0 = m.profiles.get(id);
  if (!p0) { main.innerHTML = '<div class="empty"><h2>Không tìm thấy người này</h2><p><a class="linkish" href="#/bang-vang">Về Bảng vàng</a></p></div>'; return; }
  profileViews.set(main, { id, sort, shown, kind });
  const mine = ofKind(p0.rows, kind);
  const all = ofKind(m.rows, kind);
  const mid = (list) => { const v = list.map((r) => r.views).filter((x) => x != null).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
  const rate = (list) => list.length ? list.filter((r) => r.views >= HIT).length / list.length : 0;
  const p = kind === 'all' ? p0 : { ...p0, rows: mine, days: new Set(mine.map((r) => r.day)).size, views: mine.reduce((s, r) => s + (r.views ?? 0), 0),
    median: mid(mine), hitRate: rate(mine), teamHitRate: rate(all), facts: facts(mine, all) };
  const quests = questsOf(m.quests, kind);
  const kindWord = kind === 'all' ? '' : kind === 'seeding' ? ' seeding' : ' sáng tạo';
  // A slot still holding its setup name (like thaiha.creative) is not an account on Threads, as in Số liệu.
  const handles = m.team.accounts.filter((a) => a.member_id === id && a.active !== false && !/^[a-z]+\.(1|2|creative)$/.test(a.handle));
  const list = sort === 'views' ? [...p.rows].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)) : [...p.rows].reverse();
  const w = p.week;
  const week = quests.week(id, mondayOf(m.today));
  const counted = week.filter((q) => ['met', 'missed'].includes(q.status));
  main.innerHTML = `<div class="bv bv-pro${first ? '' : ' is-still'}">
    <a class="linkish" href="#/bang-vang">${icon('left')}Bảng vàng</a>
    <section class="stage bv-stage bv-pro-stage">
      <div class="bv-pro-id">${avatar(p, 96)}
        <div><p class="eyebrow">${esc(p.level.title)} · cấp ${p.level.n}</p><h1>${esc(p.member.name)}</h1>
          <p class="bv-handles">${handles.map((a) => `<span>@${esc(a.handle)}</span>`).join('')}</p></div></div>
      <div class="bv-level"><span class="bv-bar" aria-hidden="true"><i style="--w:${Math.round(p.level.progress * 100)}%"></i></span>
        <small><b data-count="${p.xp}">${n(p.xp)}</b> XP · cần thêm ${n(p.level.left)} XP để lên cấp ${p.level.n + 1}</small></div>
      <div class="bv-pro-kind">${kindSwitch('pro-kind', kind, { dark: true, counts: kindCounts(p0.rows), label: 'Xem bài' })}</div>
      <dl class="bv-pro-kpis">
        <div><dt>Hạng tuần này</dt><dd><b>${w?.xp ? `#${w.place}` : '–'}</b>${w ? move(w.move) : ''}</dd></div>
        <div><dt>Chuỗi đăng</dt><dd class="bv-flame-big">${icon('flame')}<b>${p.streak.current}</b><span>dài nhất ${p.streak.longest}</span></dd></div>
        <div><dt>Bài${kindWord}</dt><dd><b data-count="${p.rows.length}">${n(p.rows.length)}</b><span>${p.days} ngày</span></dd></div>
        <div><dt>Lượt xem</dt><dd><b data-count="${p.views}" data-fmt="k">${k(p.views)}</b><span>${k(p.median)} / bài</span></dd></div>
        <div><dt>Tỷ lệ hit</dt><dd><b>${Math.round(p.hitRate * 100)}%</b><span>nhóm ${Math.round(p.teamHitRate * 100)}%</span></dd></div>
      </dl>
      ${p.badges.length ? `<ul class="bv-badges">${p.badges.map((b) => `<li class="b-${b.key}" title="${esc(b.hint)}"><span>${esc(b.label)}</span>${b.n > 1 ? `<em>×${b.n}</em>` : ''}</li>`).join('')}</ul>` : ''}
    </section>
    <section class="bv-panel bv-pro-quest">
      <header><div><h2>Tiến độ tuần này${kindWord ? ` ·${kindWord}` : ''}</h2>${needLine({ ...m, quests }, { mem: p.member, qs: week, of: counted.length }, week.map((q) => q.day))}</div>
        ${m.manager ? `<a class="btn btn-line sm" href="#/cai-dat" data-set-target="${esc(id)}">Đổi mục tiêu</a>` : ''}</header>
      <div class="pq-row">${week.map((q) => `<span class="pq-d${q.day === m.today ? ' today' : ''}" title="${esc(dayText(p.member, q))}">${dayMark(q)}<small>${weekday(q.day)}</small>${dayCounts(q)}</span>`).join('')}
        <span class="pq-sum"><b>${counted.filter((q) => q.status === 'met').length}/${counted.length}</b><small>ngày đủ bài</small>
          ${p.quest ? `${flame(p.quest, false, 'Ngày liền đủ bài')}<small>ngày liền</small>` : ''}</span></div>
    </section>
    <div class="bv-pro-grid">
      <aside class="bv-rail">
        <section class="bv-panel"><header><h2>Studio nhận thấy</h2><small>Dựa trên dữ liệu bài đăng</small></header>
          ${p.facts.length ? `<ul class="bv-facts">${p.facts.map(factHtml).join('')}</ul>` : '<p class="bv-calm">Cần thêm vài bài nữa để Studio phân tích được xu hướng.</p>'}</section>
        <section class="bv-panel"><header><h2>Lịch đăng</h2><small>6 tuần</small></header>${calendarHtml(p.rows, m.today)}</section>
      </aside>
      <section class="bv-feed" aria-label="Bài của ${esc(p.member.name)}">
        <div class="bv-feed-tools"><h2 class="bv-h">Bài${kindWord} của ${esc(firstName(p.member.name))}</h2>
          <div class="seg" role="group" aria-label="Sắp xếp"><button type="button" data-sort="views" aria-pressed="${sort === 'views'}">Xem nhiều</button><button type="button" data-sort="new" aria-pressed="${sort === 'new'}">Mới nhất</button></div></div>
        <div class="tp-list">${list.length ? list.slice(0, shown).map((r) => postHtml(m, r)).join('') : '<p class="bv-none">Hệ thống chưa ghi nhận bài nào.</p>'}</div>
        ${list.length > shown ? `<p class="bv-more"><button class="btn btn-line sm" type="button" data-more>Xem thêm · còn ${list.length - shown}</button></p>` : ''}
      </section>
    </div>
  </div>`;
  if (first) countUp(main);
  setTargetLinks(main);
  const again = (next) => { const y = window.scrollY; paintProfile(main, m, id, { sort, shown, kind, ...next }); window.scrollTo(0, y); };
  main.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => again({ sort: b.dataset.sort, shown: PAGE })));
  main.querySelector('[data-more]')?.addEventListener('click', () => again({ shown: shown + PAGE }));
  main.querySelectorAll('[data-pro-kind]').forEach((b) => b.addEventListener('click', () => again({ kind: b.dataset.proKind, shown: PAGE })));
}
