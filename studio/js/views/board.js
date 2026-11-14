// Bảng vàng (Nam, 2026-11-03): in place of Số liệu and Nhóm. From the top: the team's dashboard for a week, a month or a
// quarter (charts first; folded, it keeps the three tiles that matter most), then one switch: Thi đua (the period's
// crowns, the leaderboard by XP and everyone's posts in Threads' layout) and Nội dung. Each member's days against her
// plan, the old Hoạt động tab, sits in Kho bài since 2026-11-04 (Nam): mountTeamWeek draws it under her hero, for every
// member. Cần lưu ý stays for managers. Charts answer a tap or a hover in a line under them, never in a box over them. The rules live in lib/board.js.
import { loadAnalytics, loadTeamActivity, isManager, loadTargets, loadCreativeLinks, loadPool } from '../data.js?v=20261113a';
import { vnDate, mondayOf, addDays } from '../lib/week.js?v=20261113a';
import { postRows, profiles, crowns, teamWeek, teamAllTime, dailySeries, alerts, calendar, makeQuests, pendingWork, periodSeries,
  viewBands, chain, periodOf, prevPeriod, nextPeriod, periodDays, questsOf, ofKind, facts, XP, HIT, MEGA, BEAT } from '../lib/board.js?v=20261113a';
import { esc, icon, faceInner, toast } from '../ui.js?v=20261113a';
import { FOCUS_KEY } from './targets.js?v=20261113a';
import { PILLARS, NONE, PLAN, MIN_READ, HIT_VIEWS, pillarMeta, pillarOf, ofPillar, pillarTable, pillarInsights, bestPillar, squarify, mixByWeek, supply, memberMix, poolByPillar, groupStats, pillarTag, pickPillar, METRICS, metricOf, replyVoices, SORT_COLS, cleanSorts, sortPillars } from '../lib/pillars.js?v=20261113a';
import { setPillar } from '../data.js?v=20261113a';
import { POOL_PILLAR_KEY } from './today.js?v=20261113a';

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('vi-VN');
const k = (v) => v == null ? '–' : compact.format(v);
const n = (v) => v == null ? '–' : whole.format(v);
const dm = (iso) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const weekday = (iso) => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
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
  const model = await loadModel(ctx);
  const { today } = model;
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
  const state = before ? Object.assign(before.state, { period }) : { period, view: 'game',
    filter: 'all', who: '', sort: 'new', shown: PAGE, chart: 'views', folded: store.get('studio.board.dashOpen') !== '1',
    dashKind: isKind(store.get('studio.board.dashKind')) ? store.get('studio.board.dashKind') : 'all', feedKind: 'all', feedPeriod: null,
    // Nội dung (content pillars): its own window and kind, the list's order, the pillar opened in it and whether all its
    // posts show; pillar filters the feed.
    pillar: '', plSpan: store.get('studio.board.plSpan') ?? '4w', plKind: 'all', plSort: 'posts', plSorts: (() => { try { return cleanSorts(JSON.parse(store.get('studio.board.plSorts') ?? 'null')); } catch { return cleanSorts(null); } })(), plOpen: null, plAll: false,
    // The pillar table's own period, remembered per device; null follows the hero's window.
    plTbl: ['week', 'month', 'quarter'].includes(store.get('studio.board.plTbl')) ? store.get('studio.board.plTbl') : null };
  states.set(main, { state, today });
  paintBoard(main, model, state, !before);
}

// Every read Bảng vàng and Kho bài's team week draw from.
async function loadModel(ctx) {
  // Targets, links and the pool are extras: before migration member_targets the page runs on the default targets.
  const [data, activity, manager, targets, links, pool] = await Promise.all([loadAnalytics(), loadTeamActivity(),
    isManager().catch(() => false), loadTargets().catch(() => []), loadCreativeLinks().catch(() => []), loadPool().catch(() => null)]);
  const now = Date.now();
  const today = vnDate();
  const members = ctx.team.members.filter((m) => !m.is_demo);
  const team = { members, accounts: ctx.team.accounts };
  const rows = postRows({ team, posts: data.posts, observations: data.observations, versions: data.versions, cards: data.cards, events: activity.events,
    installs: data.installs, links: data.links }, now);
  const pending = pendingWork({ events: [...activity.events, ...links], posts: data.posts }, now);
  const quests = makeQuests({ rows, pending, targets, accounts: ctx.team.accounts, today });
  return { ctx, rows, members, team, activity, manager, now, today, quests, pool, cards: data.cards, first: rows[0]?.day ?? today,
    profiles: profiles(rows, members, today, quests) };
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
// Whether the reading run found the download link in the post or her replies (Nam, 2026-11-05). A post not read yet
// shows nothing.
function linkFlag(r, tag = 'span') {
  if (r.link == null) return '';
  return `<${tag} class="tp-link ${r.link ? 'ok' : 'no'}" title="${r.link ? 'Có link tải app trong bài hoặc bình luận' : 'Lần đọc không thấy link tải app'}">${icon('link')}${r.link ? 'Có link' : 'Không link'}</${tag}>`;
}

// The link reply (R2) under R1, and what its link brought (Nam, 2026-11-09). Icons and numbers only; each number's
// words and rate sit in its tooltip. A number with no source shows nothing: Threads counts no link taps, and Apple
// lists a link code's downloads only from 5 up.
const pctOf = (a, b) => a != null && b ? `${(a / b * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : '';
const one = (v) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
function dlNorm(m) {
  if (m.dlNorm != null) return m.dlNorm;
  const xs = m.rows.filter((r) => r.dl != null && r.views).map((r) => r.dl / r.views * 1000).sort((a, b) => a - b);
  m.dlNorm = xs.length ? xs[Math.floor(xs.length / 2)] : 0;
  return m.dlNorm;
}
function linkPill(m, r) {
  const seg = (name, v, title, cls = '') => `<span class="tf-s${cls}" title="${esc(title)}">${icon(name)}<b>${v}</b></span>`;
  const parts = [];
  if (r.r2Views != null) parts.push(seg('link', k(r.r2Views), `${n(r.r2Views)} lượt xem bình luận có link${r.views ? ` · bằng ${pctOf(r.r2Views, r.views)} lượt xem bài` : ''}`));
  if (r.dl != null) parts.push(seg('download', k(r.dl), `${n(r.dl)} lượt tải qua link này (App Store, cộng dồn)${r.r2Views ? ` · ${pctOf(r.dl, r.r2Views)} lượt xem link` : ''}`, ' dl'));
  else if (r.dlUnder5) parts.push(seg('download', '&lt;5', 'Dưới 5 lượt tải: Apple chỉ hiện số của một link từ 5 lượt tải', ' dl hid'));
  if (!parts.length) return '';
  let sig = '';
  const norm = dlNorm(m);
  if (r.dl != null && r.views) {
    const per = r.dl / r.views * 1000;
    const level = per >= norm * 1.5 ? 3 : per >= norm * 0.67 ? 2 : 1;
    const text = `${one(per)} lượt tải trên 1.000 lượt xem bài · mức chung của nhóm ${one(norm)}`;
    sig = `<span class="tf-sig l${level}" title="${esc(text)}" aria-label="${esc(text)}"><i></i><i></i><i></i></span>`;
  } else if (r.dlUnder5 && r.views && 5 / r.views * 1000 < norm * 0.67) {
    // Under 5 downloads on enough views is below the team's level for sure.
    const text = `Dưới ${one(5 / r.views * 1000)} lượt tải trên 1.000 lượt xem bài · mức chung của nhóm ${one(norm)}`;
    sig = `<span class="tf-sig l1" title="${esc(text)}" aria-label="${esc(text)}"><i></i><i></i><i></i></span>`;
  }
  return `<div class="tf-row"><div class="tp-funnel" aria-label="Link trong bình luận">${parts.join('<i class="tf-a"></i>')}</div>${sig}</div>`;
}
function r2Html(m, r, { feature = false } = {}) {
  const pill = linkPill(m, r);
  if (feature) return pill ? `<div class="tp-r2 solo">${pill}</div>` : '';
  if (!r.r2) return '';
  const text = String(r.r2).replace(/\S*apps\.apple\.com\S*/g, '').trim();
  return `<div class="tp-r2"><span class="tp-mini" aria-hidden="true">${faceInner(r.member)}</span>
      <div><p class="tp-who"><b>${esc(r.account.handle)}</b></p>${text ? `<p class="tp-text cut">${esc(text)}</p>` : ''}${pill}</div></div>`;
}

function postHtml(m, r, { feature = false } = {}) {
  const p = m.profiles.get(r.member.id);
  const r1 = r.r1 ? `<div class="tp-r1${r.r2 ? ' has-r2' : ''}"><span class="tp-mini" aria-hidden="true">${faceInner(r.member)}</span>
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
    <p class="tp-pillar">${pillarTag(pillarOf(r), { edit: `post:${r.id}` })}</p>
    <ul class="tp-nums" aria-label="Số liệu">
      <li title="Lượt xem">${icon('eye')}<b>${k(r.views)}</b></li>
      <li title="Lượt thích">${icon('line')}<b>${k(r.likes)}</b></li>
      <li title="Lượt trả lời">${icon('reply')}<b>${k(r.replies)}</b></li>
      <li title="Đăng lại">${icon('repost')}<b>${k(r.reposts)}</b></li>
      ${r.edited ? '<li class="tp-edited">Đã sửa</li>' : ''}
      ${linkFlag(r, 'li')}
      ${r.source_url ? `<li class="tp-open"><a href="${esc(r.source_url)}" target="_blank" rel="noopener" aria-label="Mở trên Threads">${icon('out')}</a></li>` : ''}
    </ul>
    ${feature ? r2Html(m, r, { feature: true }) : r1 + r2Html(m, r)}${themes}
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
  const item = (r) => `<li><span class="qx-text"><b>@${esc(r.account.handle)} · ${time(r.published_at)} ${linkFlag(r)}</b><span>${esc(r.op)}</span></span>
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

// A week not started yet has no counted day, so its column shows a dash.
const sumCell = (x) => `<span class="qw-sum" role="cell"><span>${x.of ? `<b>${x.met}</b><small>/${x.of}<span class="qw-unit"> ngày</span></small>` : '<b>–</b>'}</span>${x.extra ? `<em>+${x.extra} bài</em>` : ''}</span>`;

// A day still to come shows its plan in outline, so anyone reads the next days' posts from the table (Nam, 2026-11-04).
function planCell(mem, q) {
  const t = q.target;
  const parts = KINDS.filter(([key]) => t[key]).map(([key, , cls]) => `<span class="kc plan">${glyph(cls)}${t[key]}</span>`).join('');
  const say = t.seeding + t.creative ? `cần ${[t.seeding && `${t.seeding} seeding`, t.creative && `${t.creative} sáng tạo`].filter(Boolean).join(' và ')}` : 'ngày nghỉ';
  return `<span class="qw-plan" role="img" aria-label="${esc(`${mem.name}, ${weekday(q.day)} ${dm(q.day)}: ${say}`)}"><span class="kcs">${parts || '<span class="kc rest">nghỉ</span>'}</span></span>`;
}

// The viewer's day, the top of Kho bài's dark hero above the team week (Nam, 2026-11-04): what today still asks of her,
// by kind, where each kind is posted from and a button to start it (seeding: the pool; creative: today.js's link sheet).
// today.js puts it above the cards she holds; the next days and the rules live with the team week.
const KIND_HOW = { seeding: 'Giữ bài trong kho chung, đăng trên Threads, rồi bấm Đã đăng xong.', creative: 'Bài bạn tự viết. Tạo link rồi dán vào bình luận 2.' };
const KIND_GO = { seeding: '<button type="button" class="kt-go" data-jump>Chọn bài</button>', creative: '<button type="button" class="kt-go" data-sheet="link">Tạo link</button>' };
function myDayHtml(m) {
  const me = m.members.find((x) => x.id === m.ctx.me?.id);
  if (!me) return '';
  const q = m.quests.day(me.id, m.today);
  if (q.status === 'before') return '';
  const head = q.status === 'met' ? `Hôm nay bạn đã đủ bài${q.extra ? `, thêm ${q.extra} bài` : ''}.`
    : q.status === 'rest' ? `Hôm nay bạn nghỉ${q.extra ? `, vẫn đăng ${q.extra} bài` : ''}.`
      : `Hôm nay bạn cần đăng thêm ${kindList(q.short)}`;
  const kinds = KINDS.filter(([key]) => q.target[key] || q[key]).map(([key, label, cls]) => {
    const got = q[key];
    const want = q.target[key];
    const done = got >= want;
    return `<li class="kt-k ${cls}${done ? ' is-done' : ''}"><span class="kt-n">${glyph(cls)}<b>${want ? `${got}/${want}` : `+${got}`}</b>${done ? icon('check') : ''}</span>
      <span><b>${label}</b><small>${done ? (got > want ? `Đã đủ, thêm ${got - want} bài` : 'Đã đủ') : KIND_HOW[key]}</small></span>${done ? '' : KIND_GO[key]}</li>`;
  }).join('');
  return `<div class="kt-today s-${q.status}"><p class="eyebrow">Hôm nay của bạn · ${weekday(m.today)} ${dm(m.today)}</p><h2 class="kt-h">${head}</h2>
    ${kinds ? `<ul class="kt-kinds">${kinds}</ul>` : ''}</div>`;
}

// The rules under the team week, in a fold; the first line follows the viewer's own plan.
function rulesHtml(m) {
  const set = m.members.some((x) => x.id === m.ctx.me?.id) && m.quests.day(m.ctx.me.id, m.today).target.set;
  return `<details class="kt-rules"><summary>Mục tiêu tính thế nào</summary><ul>
    <li>${set ? 'Quản lý đặt mục tiêu cho từng thứ trong tuần. Kế hoạch lặp lại mỗi tuần cho tới khi quản lý đổi.' : 'Khi chưa có mục tiêu riêng, mỗi ngày là 1 bài seeding cho mỗi tài khoản seeding.'}</li>
    <li>Ngày đủ bài khi đủ cả seeding và sáng tạo. Bài seeding thừa không bù cho bài sáng tạo thiếu.</li>
    <li>Mục tiêu là mức tối thiểu. Mỗi ngày đủ bài +${XP.quest} XP, mỗi bài đăng thêm +${XP.extra} XP.</li>
    <li>Bài bấm Đã đăng xong và link bài tự viết được tính ngay. Máy đọc Threads xác nhận sau, 6 tiếng một lần.</li>
    <li>Ngày có mục tiêu 0 là ngày nghỉ và không làm đứt chuỗi ngày đủ bài.</li>
    <li>Tuần tới chỉ hiện kế hoạch của từng người.</li></ul></details>`;
}

// A week: one row per member, a day per column, a mark and a count per kind in each cell; a tap opens the day under
// the table.
// No ranking: the table is for checking status, so members keep one order by name every week and no place shows (Nam,
// 2026-11-04: the eye should not have to find a new row each week).
function weekBoard(m, s, days) {
  const ranked = questRank(m, days).sort((a, b) => a.mem.name.localeCompare(b.mem.name, 'vi'));
  const open = s.open && days.includes(s.open.day) ? s.open : null;
  return `<div class="qw" role="table" aria-label="Từng người, từng ngày">
    <div class="qw-row qw-head" role="row"><span role="columnheader"></span><span role="columnheader">Thành viên</span>
      ${days.map((d) => `<span role="columnheader" class="${d === m.today ? 'today' : ''}">${weekday(d)}<small>${dm(d)}</small></span>`).join('')}<span role="columnheader">Ngày đủ</span></div>
    ${ranked.map((x, i) => {
      const p = m.profiles.get(x.mem.id);
      return `<div class="qw-row${x.mem.id === m.ctx.me?.id ? ' is-me' : ''}" role="row" data-member="${esc(x.mem.id)}" style="--i:${i}">
        <span class="qw-place" role="cell"></span>
        <a class="qw-who" role="rowheader" href="#/bang-vang/${esc(x.mem.id)}">${avatar(p, 36)}<span><b>${esc(firstName(x.mem.name))}${flame(p.quest, false, `${p.quest} ngày liền đủ bài`)}</b>${needLine(m, x, days)}</span></a>
        ${x.qs.map((q) => `<span role="cell" class="qw-c${q.day === m.today ? ' today' : ''}">${q.status === 'future' ? planCell(x.mem, q)
          : q.status === 'before' ? `<span class="dm s-${q.status}"></span>`
          : `<button type="button" class="qw-b${open?.member === x.mem.id && open.day === q.day ? ' is-open' : ''}" data-cell="${q.day}" aria-label="${esc(dayText(x.mem, q))}">${dayMark(q)}${dayCounts(q)}</button>`}</span>`).join('')}
        ${sumCell(x)}
      </div>`;
    }).join('')}
  </div>
  ${open ? dayDetail(m, open.member, open.day) : ''}`;
}

// Kho bài's second part (Nam, 2026-11-04): the team's week, one row per member in the same order every week.
// Arrows step back to earlier weeks and forward up to 4 weeks, where each day shows only the plan; a tap on a day opens
// it under the table. Cần lưu ý follows, for managers only.
const AHEAD = 4;
function teamWeekHtml(m, s, first) {
  const p = s.period;
  const days = periodDays(p);
  const current = days.includes(m.today);
  const ahead = p.from > m.today;
  const last = p.from >= addDays(mondayOf(m.today), AHEAD * 7);
  const title = current ? 'Tuần này' : ahead && p.from === addDays(mondayOf(m.today), 7) ? 'Tuần tới' : 'Tuần';
  const sample = (status, seeding, extra = 0) => ({ status, target: { seeding: 2, creative: 0 }, seeding, creative: 0, wait: [], extra });
  return `<div class="bv kb-team${first ? '' : ' is-still'}"><section class="bv-quests" aria-labelledby="kb-team-h">
      <header class="bq-head"><div><p class="eyebrow">Hoạt động · cả nhóm</p><h2 id="kb-team-h">${title} ${periodName(p)}</h2><p class="bq-sub">${ahead ? 'Chưa tới, chỉ hiện kế hoạch của từng người' : 'Ai đã đăng đủ, ai còn thiếu, từng ngày'}</p></div>
        <div class="kb-team-acts"><span class="kb-team-step"><button type="button" class="icon-btn" data-week="-1" aria-label="Tuần trước">${icon('left')}</button>
          <button type="button" class="icon-btn" data-week="1" aria-label="Tuần sau"${last ? ' disabled' : ''}>${icon('right')}</button></span>
          ${m.manager ? '<a class="bq-set" href="#/cai-dat" data-set-target="*">Đặt mục tiêu</a>' : ''}</div></header>
      <div class="bq-key"><span class="bq-marks"><span>${dayMark(sample('met', 2))}Đủ bài</span><span>${dayMark(sample('missed', 1))}Thiếu bài</span><span>${dayMark(sample('open', 1))}Hôm nay</span><span>${dayMark(sample('met', 3, 1))}Đăng thêm</span></span>
        <span class="bq-kinds">${KINDS.map(([, label, cls]) => `<span>${glyph(cls)}${label}</span>`).join('')}<span><b class="kc short">0/1</b>còn thiếu</span></span></div>
      ${weekBoard(m, s, days)}
      <p class="bq-foot">Mỗi ô là số bài đã đăng / mục tiêu, tách seeding và sáng tạo. Chạm vào một ngày để xem bài nào đã đăng, bài nào còn thiếu. Bài chờ lần đọc tiếp theo được tính ngay.</p>
      ${rulesHtml(m)}
    </section>${alertsHtml(m)}</div>`;
}

// Draws the team week into host and returns the viewer's day for the hero today.js draws under it.
export async function mountTeamWeek(host, ctx, { still: quiet = false } = {}) {
  const m = await loadModel(ctx);
  if (!host.isConnected) return { day: '' };
  const s = { period: periodOf('week', m.today), open: null };
  const paint = (first = false) => { host.innerHTML = teamWeekHtml(m, s, first); setTargetLinks(host); };
  paint(!quiet);
  host.onclick = (e) => {
    const cell = e.target.closest('[data-cell]');
    const step = e.target.closest('[data-week]');
    if (cell) {
      const member = cell.closest('[data-member]').dataset.member;
      const same = s.open?.member === member && s.open?.day === cell.dataset.cell;
      s.open = same ? null : { member, day: cell.dataset.cell };
      paint();
      if (!same) host.querySelector('.qx')?.scrollIntoView({ block: 'nearest', behavior: still() ? 'auto' : 'smooth' });
    } else if (e.target.closest('[data-close]')) {
      s.open = null;
      paint();
    } else if (step && !step.disabled) {
      s.period = periodOf('week', addDays(s.period.from, Number(step.dataset.week) * 7));
      s.open = null;
      paint();
      host.querySelector(`[data-week="${step.dataset.week}"]`)?.focus();
    }
  };
  return { day: myDayHtml(m) };
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
  // Managers only (Nam, 2026-11-04: the team week is for everyone, the reminders are for managers).
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
  if (s.pillar) list = ofPillar(list, s.pillar);
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
  const set = s.feedKind !== 'all' || s.filter !== 'all' || s.who || s.pillar;
  // The pillar picker lists the pillars with posts of the chosen kind in the period, with their counts.
  const pillarCounts = [...PILLARS, NONE].map((p) => ({ p, count: ofPillar(ofK, p.key).length })).filter((o) => o.count || o.p.key === s.pillar);
  const pl = s.pillar ? pillarMeta(s.pillar) : null;
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
        <label class="fd-pick fd-pl${pl ? ' on' : ''}"${pl ? ` style="--pc:${pl.color}"` : ''}><i class="pl-dot" aria-hidden="true"></i>
          <select data-fd-pillar aria-label="Lọc theo dạng bài"><option value="">Mọi dạng bài</option>${pillarCounts.map(({ p, count }) => `<option value="${p.key}"${s.pillar === p.key ? ' selected' : ''}>${esc(p.vi)} · ${count}</option>`).join('')}</select>${icon('down')}</label>
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
  feed.querySelector('[data-fd-pillar]').onchange = (e) => go({ pillar: e.target.value, shown: PAGE });
  const clear = feed.querySelector('[data-fd-clear]');
  if (clear) clear.onclick = () => go({ feedKind: 'all', filter: 'all', who: '', pillar: '', shown: PAGE });
  wirePillarEdits(feed, m, () => paintFeed(main, m, s, {}, { top: false }));
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

/* ---------- Nội dung: the numbers by content pillar (Nam, 2026-11-04; second design the same day) ----------
   The hero is three charts on the lacquer, like the team dashboard: the mix as a treemap, each pillar's average against
   the team's as diverging bars, and the mix week by week as a stream. Below it: what Studio sees, posts against views,
   how long Kho bài lasts per pillar, each member's mix, and the table that opens to a pillar's posts. The window is whole
   weeks ending today (4 or 12) or everything, since one week holds too few posts per pillar (research 2026-11-04). */

const PL_SPANS = [['4w', '4 tuần', 4], ['12w', '12 tuần', 12], ['all', 'Từ đầu', null]];
const plSpanOf = (v) => PL_SPANS.find(([key]) => key === v) ?? PL_SPANS[0];
const pct = (x) => x == null ? '–' : `${Math.round(x * 100)}%`;
const rate = (x) => x == null ? '–' : x.toLocaleString('vi-VN', { maximumFractionDigits: x < 10 ? 1 : 0 });
// A rate kept per 1,000 views, shown as a percentage of views (Nam, 2026-11-04): 31 → 3,1%, 0,9 → 0,09%.
const pv = (perK) => { if (perK == null) return '–'; const v = perK / 10; return `${v.toLocaleString('vi-VN', { maximumFractionDigits: v && v < .1 ? 2 : v < 10 ? 1 : 0 })}%`; };
const mfmt = (mt, v) => (v == null ? '–' : mt.pct ? pv(v) : k(Math.round(v)));
const times = (x) => `${x.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: x < 10 ? 1 : 0 })}×`;
const timesWord = (x) => `${x.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} lần`;
const dayCount = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;
const plName = (key) => `<b class="pl-nm" style="--pc:${pillarMeta(key).color}">${esc(pillarMeta(key).vi)}</b>`;

// The window and the one before it, of the same number of days. A window before it that starts before the first post
// has nothing fair to compare, so it has no prev.
function plWindow(m, s) {
  const [key, label, weeks] = plSpanOf(s.plSpan);
  if (!weeks) return { key, label, from: m.first, to: m.today, prev: null, weeks: Math.max(1, dayCount(m.first, m.today) / 7) };
  const from = addDays(mondayOf(m.today), -7 * (weeks - 1));
  const prev = { from: addDays(from, -7 * weeks), to: addDays(m.today, -7 * weeks) };
  return { key, label, from, to: m.today, prev: prev.from >= m.first ? prev : null, weeks: dayCount(from, m.today) / 7 };
}

function liftHtml(p) {
  if (p.lift == null) return '<span class="pl-lift none">–</span>';
  const cls = !p.solid ? 'thin' : p.lift >= 1.15 ? 'up' : p.lift <= .85 ? 'down' : 'even';
  const title = p.solid ? 'Trung bình của dạng bài so với mức chung' : `Mới có ${p.read} bài có lượt xem, chưa đủ ${MIN_READ} bài để so sánh`;
  return `<span class="pl-lift ${cls}" title="${title}">${times(p.lift)}</span>`;
}

// A member taps a post's tag to fix its pillar; the row changes in place and the view redraws.
function wirePillarEdits(root, m, redraw) {
  root.querySelectorAll('[data-pillar-edit]').forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const [kind, id] = b.dataset.pillarEdit.split(':');
      const row = m.rows.find((r) => r.id === id);
      const now = row ? pillarOf(row) : null;
      const next = await pickPillar(now);
      if (!next || next === now) return;
      try {
        await setPillar(kind, id, next);
        if (row) Object.assign(row, { pillar: next, pillar_by: 'member' });
        toast(`Đã đổi sang ${pillarMeta(next).vi}`);
        redraw();
      } catch (error) {
        console.error(error);
        toast('Chưa đổi được dạng bài. Thử lại nhé.');
      }
    };
  });
}

/* ----- The hero's three charts ----- */

// The mix as a treemap: each pillar's area is its share of the posts; a tile names the pillar and its share and, when
// it is wide and the pillar is clearly above or below the team, its lift. Every pillar stays in the map (Nam, 2026-11-04):
// a small pillar's tile takes at least a floor of the area (MIN_TILE of the layout) so its name fits, while its label
// keeps the true share. Two layouts, one wide and one near square, and the page shows the one that fits; fitTreemap()
// then sizes each tile's text to its tile.
const MIN_TILE = { wide: .045, tall: .065 };
function plTreemap(table) {
  const all = table.filter((p) => p.posts);
  const total = all.reduce((sum, p) => sum + p.posts, 0);
  const sized = (floor) => all.map((p) => ({ key: p.key, value: Math.max(p.posts, floor * total), p }));
  const one = (W, H, cls) => `<div class="tm ${cls}">${squarify(sized(MIN_TILE[cls]), W, H).map((r, i) => {
    const { p } = r;
    const read = `<b>${esc(p.vi)}</b> · ${p.posts} bài (${pct(p.share)}) · trung bình ${k(p.avg)} lượt xem${p.lift != null ? ` · ${times(p.lift)} mức chung${p.solid ? '' : `, mới ${p.read} bài`}` : ''}`;
    const lift = p.solid && p.lift != null && r.w / W > .28 && r.h / H > .3 && (p.lift >= 1.15 || p.lift <= .85)
      ? `<em class="tm-lift ${p.lift >= 1.15 ? 'up' : 'down'}">${p.lift >= 1.15 ? '↑' : '↓'}${times(p.lift)}</em>` : '';
    return `<button type="button" class="tm-t${PLAN.includes(p.key) ? '' : ' aside'}" style="--pc:${p.color};--i:${i};left:${(r.x / W * 100).toFixed(3)}%;top:${(r.y / H * 100).toFixed(3)}%;width:${(r.w / W * 100).toFixed(3)}%;height:${(r.h / H * 100).toFixed(3)}%"${readAttr(read)} aria-label="${esc(p.vi)}: ${p.posts} bài">
      <span class="tm-in">${lift}<span class="tm-n">${esc(p.vi)}</span><span class="tm-v">${pct(p.share)}</span></span></button>`;
  }).join('')}</div>`;
  return `<figure class="pl-tm has-read">${one(16, 9, 'wide')}${one(10, 11, 'tall')}
    <p class="d-read">Ô càng lớn, dạng bài càng được đăng nhiều · chạm vào ô để xem</p></figure>`;
}

// Sizes each tile's text to its tile: the font starts at a size set by the tile's width and steps down until the name
// and the share fit without a cut; at the smallest step the share goes and the name alone fits. Runs after each paint
// and when a tile changes size, such as on a turn of the phone.
const TM_FIT = new WeakMap();
function fitTreemap(root) {
  root.querySelectorAll('.tm').forEach((tm) => {
    const fit = () => tm.querySelectorAll('.tm-in').forEach((box) => {
      const w = box.clientWidth;
      if (!w) return;
      // The text sits at the tile's foot, where an overflow at the top does not count, so it is measured from the top.
      box.classList.remove('no-v', 'no-lift', 'no-n');
      box.classList.add('tm-measure');
      let f = Math.max(9, Math.min(17, w / 7.5));
      const over = () => box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
      box.style.setProperty('--f', `${f}px`);
      while (over() && f > 9) { f -= .5; box.style.setProperty('--f', `${f}px`); }
      if (over()) box.classList.add('no-lift');
      if (over()) box.classList.add('no-v');
      if (over()) box.classList.add('no-n');
      box.classList.remove('tm-measure');
    });
    fit();
    if (!TM_FIT.has(tm) && 'ResizeObserver' in window) {
      let last = 0;
      const ro = new ResizeObserver(() => { if (Math.abs(tm.clientWidth - last) > 1) { last = tm.clientWidth; fit(); } });
      ro.observe(tm);
      TM_FIT.set(tm, ro);
    }
  });
}

// Each pillar's average against the team's as bars from a centre line, on a log scale so 2× and 0,5× are the same length.
// Gold reaches right for pillars above the team, coral left for those below; a pillar under MIN_READ read posts is
// hatched. Only pillars with 3 read posts or more are drawn.
// The metric switch (Nam, 2026-11-04) picks what the bars compare: views per post, or likes, replies or reposts per
// 1,000 views. A pillar with no like, reply or repost has no bar on a log scale, so it shows at the left edge as 0.
function plLiftChart(table, team, mt = METRICS[0]) {
  const teamV = mt.of(team);
  const list = table.filter((p) => PLAN.includes(p.key) && p.read >= 3 && mt.of(p) != null)
    .map((p) => ({ p, lift: p.lifts?.[mt.key] ?? null })).filter((x) => x.lift != null && x.lift > 0).sort((a, b) => b.lift - a.lift);
  const zero = table.filter((p) => PLAN.includes(p.key) && p.read >= 3 && mt.of(p) === 0);
  if ((!list.length && !zero.length) || !teamV) return `<p class="pl-calm">Cần có ít nhất 3 bài có lượt xem thuộc một dạng bài${mt.key === 'views' ? '' : `, và nhóm có lượt ${mt.vi.toLowerCase()}`}.</p>`;
  const fmt = (v) => mfmt(mt, v);
  const span = Math.min(3, Math.max(1, ...list.map((x) => Math.ceil(Math.abs(Math.log2(x.lift)) * 2) / 2)));
  const bar = ({ p, lift }, i) => {
    const v = Math.max(-span, Math.min(span, Math.log2(lift)));
    const w = (Math.abs(v) / span) * 50;
    const read = `<b>${esc(p.vi)}</b> · ${fmt(mt.of(p))} ${mt.unit} · ${times(lift)} mức chung ${fmt(teamV)} · ${p.read} bài có lượt xem`;
    return `<li class="lf${v >= 0 ? ' up' : ' down'}${p.solid ? '' : ' thin'}" style="--i:${i}"${readAttr(read)}>
      <span class="lf-n"><i class="pl-dot" style="--pc:${p.color}" aria-hidden="true"></i>${esc(p.vi)}</span>
      <span class="lf-t"><i class="lf-b" style="${v >= 0 ? `left:50%` : `right:50%`};width:${w.toFixed(2)}%"></i><em style="${v >= 0 ? `left:calc(50% + ${w.toFixed(2)}% + 6px)` : `right:calc(50% + ${w.toFixed(2)}% + 6px)`}">${times(lift)}</em></span></li>`;
  };
  const none = (p, i) => `<li class="lf down zero" style="--i:${list.length + i}"${readAttr(`<b>${esc(p.vi)}</b> · chưa có lượt ${mt.vi.toLowerCase()} nào trong ${p.read} bài`)}>
      <span class="lf-n"><i class="pl-dot" style="--pc:${p.color}" aria-hidden="true"></i>${esc(p.vi)}</span><span class="lf-t"><em style="right:calc(50% + 6px)">0</em></span></li>`;
  return `<figure class="pl-lf has-read"><ol>${list.map(bar).join('')}${zero.map(none).join('')}</ol>
    <div class="lf-axis" aria-hidden="true"><span>${times(2 ** -span)}</span><span>mức chung ${fmt(teamV)}</span><span>${times(2 ** span)}</span></div>
    <p class="d-read">${mt.key === 'views' ? 'Lượt xem trung bình mỗi bài' : `Tỷ lệ ${mt.vi.toLowerCase()} trên lượt xem`} · vạch giữa là mức của cả nhóm · sọc là dạng bài chưa đủ ${MIN_READ} bài</p></figure>`;
}

// The mix week by week as a stream: each band is a pillar's share of the week's posts, the five most posted pillars in
// the fixed order and the rest in grey, with smooth curves between the weeks. A tap on a week reads its mix.
function plStream(m, s) {
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const from = addDays(mondayOf(m.today), -7 * i);
    if (addDays(from, 6) < m.first) continue;
    weeks.push({ from, to: addDays(from, 6) });
  }
  if (weeks.length < 2) return '<p class="pl-calm">Cần có bài trong ít nhất 2 tuần.</p>';
  const rows = ofKind(m.rows.filter((r) => r.day >= weeks[0].from), s.plKind);
  const { keys, weeks: mix } = mixByWeek(rows, weeks, 5);
  // A week with no post keeps the week before's mix, so a band never drops to nothing for a quiet week.
  let last = null;
  const shares = mix.map((w) => { if (w.posts) last = w.share; return last ?? new Map(keys.map((k2) => [k2, k2 === 'rest' ? 1 : 0])); });
  const W = 600, H = 170;
  // Each week sits at the centre of its tap column; the first and last weeks run out to the edges.
  const x = (i) => ((i + .5) / mix.length) * W;
  const edge = (vals) => [[0, H - vals[0] * H], ...vals.map((v, i) => [x(i), H - v * H]), [W, H - vals[vals.length - 1] * H]];
  const color = (key) => (key === 'rest' ? 'var(--st-rest)' : pillarMeta(key).color);
  const curve = (pts) => pts.map(([px, py], i) => {
    if (!i) return `M${px.toFixed(1)},${py.toFixed(1)}`;
    const [qx, qy] = pts[i - 1];
    const mx = (qx + px) / 2;
    return `C${mx.toFixed(1)},${qy.toFixed(1)} ${mx.toFixed(1)},${py.toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`;
  }).join('');
  const base = mix.map(() => 0);
  const bands = keys.map((key) => {
    const low = [...base];
    const high = shares.map((sh, i) => base[i] + (sh.get(key) ?? 0));
    high.forEach((v, i) => { base[i] = v; });
    const top = curve(edge(high));
    const bottom = curve(edge(low).reverse()).replace(/^M/, 'L');
    return `<path d="${top}${bottom}Z" fill="${color(key)}" class="st-b"/>`;
  }).join('');
  const label = (key) => (key === 'rest' ? 'Còn lại' : pillarMeta(key).vi);
  const cols = mix.map((w) => {
    const parts = keys.filter((key) => w.share.get(key)).map((key) => `${esc(label(key))} ${pct(w.share.get(key))}`).join(' · ');
    return `<span class="st-c${w.to >= m.today ? ' now' : ''}"${readAttr(`<b>Tuần ${dm(w.from)}</b> · ${w.posts} bài${parts ? ` · ${parts}` : ''}`)}></span>`;
  }).join('');
  return `<figure class="pl-st has-read">
    <div class="st-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${bands}</svg><div class="st-cols">${cols}</div></div>
    <div class="st-x" aria-hidden="true"><span>${dm(mix[0].from)}</span><span>${dm(mix[Math.floor((mix.length - 1) / 2)].from)}</span><span>Tuần này</span></div>
    <ul class="st-key">${[...keys].reverse().map((key) => `<li><i style="background:${color(key)}"></i>${esc(label(key))}</li>`).join('')}</ul>
    <p class="d-read">Mỗi dải là tỷ lệ của một dạng bài trong tuần · chạm vào tuần để xem</p></figure>`;
}

/* ----- What Studio sees ----- */

// One card per insight: a kicker, the figure that carries it, one sentence and what to do about it.
function plInsightCard(f, m, best) {
  const card = (tone, kicker, figure, line, todo, key = null) => `<article class="pi ${tone}"${key ? ` style="--pc:${pillarMeta(key).color}"` : ''}>
    <p class="pi-k">${kicker}</p><p class="pi-f">${figure}</p><p class="pi-l">${line}</p>${todo ? `<p class="pi-do">${todo}</p>` : ''}</article>`;
  const p = f.p;
  switch (f.kind) {
    case 'thin': return card('calm', 'Chưa đủ dữ liệu', '–', `Chưa có dạng bài nào đủ ${MIN_READ} bài có lượt xem để so sánh.`, 'Chọn 12 tuần hoặc Từ đầu để thấy rõ hơn.');
    case 'lead': return card('good', 'Kéo lượt xem', times(p.lift), `${plName(p.key)} có trung bình ${k(p.avg)} lượt xem mỗi bài, gấp ${timesWord(p.lift)} mức chung.`, `Ưu tiên lấy bài ${esc(p.vi)} trong Kho bài.`, p.key);
    case 'drag': return card('weak', 'Đăng nhiều, xem ít', pct(p.share), `${plName(p.key)} chiếm ${pct(p.share)} số bài nhưng trung bình chỉ ${k(p.avg)} lượt xem, bằng ${timesWord(p.lift)} mức chung.`,
      best && best.key !== p.key ? `Thử thay vài bài ${esc(p.vi)} bằng ${esc(best.vi)}.` : `Thử bớt bài ${esc(p.vi)} trong tuần tới.`, p.key);
    case 'short': return card('warn', 'Kho sắp hết', `${f.stock.stock} bài`, `${plName(p.key)} đang được xem tốt (${times(p.lift)}) nhưng kho chỉ còn ${f.stock.stock} bài, đủ khoảng ${Math.max(1, Math.round(f.stock.lasts * 7))} ngày.`, `Cần thêm bài ${esc(p.vi)} ở lần tới.`, p.key);
    case 'hits': return card('good', 'Ra hit', `${f.hits}/${f.of}`, `${f.hits} trong ${f.of} bài hit (trên ${k(HIT_VIEWS)} lượt xem) là ${plName(p.key)}.`, '', p.key);
    case 'talk': return card('good', 'Được trả lời nhiều', `${pv(p.replyRate)}<small> lượt xem</small>`, `${plName(p.key)} được trả lời trên ${pv(p.replyRate)} lượt xem, mức chung là ${pv(f.team)}.`, 'Hợp để kéo người đọc vào bình luận.', p.key);
    case 'spread': return card('good', 'Được đăng lại', `${pv(p.spread)}<small> lượt xem</small>`, `${plName(p.key)} được đăng lại trên ${pv(p.spread)} lượt xem, mức chung là ${pv(f.team)}.`, 'Bài dễ lan sang người đọc mới.', p.key);
    case 'member': {
      const prof = m.profiles.get(f.member.id);
      return card('good', 'Thế mạnh riêng', times(f.best.lift), `${esc(firstName(f.member.name))} đăng ${plName(f.best.key)} được xem gấp ${timesWord(f.best.lift)} các bài khác của mình.`,
        `<a href="#/bang-vang/${esc(f.member.id)}" class="pi-who">${prof ? avatar(prof, 24) : ''}Xem trang của ${esc(firstName(f.member.name))}</a>`, f.best.key);
    }
    case 'heavy': return card('calm', 'Kho dư', `${Math.round(f.stock.lasts)} tuần`, `Kho còn ${f.stock.stock} bài ${plName(p.key)}, đủ khoảng ${Math.round(f.stock.lasts)} tuần, nhưng dạng này xem dưới mức chung (${times(p.lift)}).`, 'Có thể chọn ít bài dạng này hơn ở lần sau.', p.key);
    case 'unused': {
      const stock = f.list.filter((x) => x.stock);
      return card('calm', 'Chưa đăng', `${f.list.length}/${PLAN.length}`, `Chưa đăng ${f.list.length} dạng bài: ${f.list.map((x) => esc(pillarMeta(x.key).vi)).join(', ')}.`,
        stock.length ? `Kho còn ${stock.slice(0, 2).map((x) => `${x.stock} bài ${esc(pillarMeta(x.key).vi)}`).join(' và ')} để thử.` : '');
    }
    default: return '';
  }
}

function plInsights(m, found, table) {
  if (!found.length) return '';
  const best = [...table].filter((p) => PLAN.includes(p.key) && p.solid && p.lift != null).sort((a, b) => b.lift - a.lift)[0];
  const off = table.find((p) => p.key === 'off_topic')?.posts;
  const none = table.find((p) => p.key === 'none')?.posts;
  const notes = [off ? `${off} bài không liên quan đến tập luyện hay Vika` : '', none ? `${none} bài đang chờ gắn dạng bài ở lần đọc sau` : ''].filter(Boolean);
  return `<section class="bv-panel pl-sees"><header><div><h2>Studio nhận thấy</h2><small>Từ số liệu của khoảng đang xem</small></div></header>
    <div class="pi-grid">${found.map((f) => plInsightCard(f, m, best)).join('')}</div>
    ${notes.length ? `<p class="pl-note">${notes.join(' · ')}</p>` : ''}</section>`;
}

/* ----- Posts against views, the pool, the members ----- */

// How long Kho bài's cards of each pillar last at this window's seeding pace, shortest first; a well-viewed pillar under
// 2 weeks is marked.
function plSupply(stock, table, m) {
  if (!stock) return `<section class="bv-panel pl-sup"><header><h2>Kho bài theo dạng bài</h2></header><p class="bv-calm">Chưa tải được Kho bài.</p></section>`;
  if (!stock.length) return '';
  const lift = new Map(table.map((p) => [p.key, p]));
  // The longest stock fills the bar, up to a year, so the pillars stay apart.
  const cap = Math.min(52, Math.max(4, ...stock.map((x) => x.lasts ?? 0)));
  const list = [...stock].sort((a, b) => (a.lasts ?? 99) - (b.lasts ?? 99) || b.stock - a.stock);
  const row = (x, i) => {
    const p = pillarMeta(x.key);
    const t = lift.get(x.key);
    const hot = t?.solid && t.lift >= 1.1;
    const low = x.lasts != null && x.lasts < 2;
    const w = x.lasts == null ? 100 : Math.min(1, x.lasts / cap) * 100;
    const label = x.lasts == null ? 'chưa đăng' : x.lasts < 1 ? 'dưới 1 tuần' : `đủ ${Math.round(x.lasts)} tuần`;
    const read = `<b>${esc(p.vi)}</b> · ${x.stock} bài trong kho · ${x.perWeek ? `đăng ${rate(x.perWeek)} bài mỗi tuần` : 'chưa có bài seeding trong khoảng này'}`;
    return `<li class="sp${low ? ' low' : ''}${x.lasts == null ? ' idle' : ''}" style="--pc:${p.color};--i:${i}"${readAttr(read)}>
      <a href="#/" data-pl-pool="${x.key}" class="sp-n"><i class="pl-dot" aria-hidden="true"></i>${esc(p.vi)}</a>
      <span class="sp-t"><i style="width:${w.toFixed(1)}%"></i></span>
      <span class="sp-v"><b>${x.stock}</b> bài · ${label}${low && hot ? '<em>Cần thêm</em>' : low ? '<em class="soft">Sắp hết</em>' : ''}</span></li>`;
  };
  return `<section class="bv-panel pl-sup"><header><div><h2>Kho bài còn bao lâu</h2><small>Bài chưa đăng, theo tốc độ đăng seeding hiện tại</small></div></header>
    <figure class="has-read"><ol>${list.map(row).join('')}</ol>
      <p class="d-read">Thanh dài nhất là ${Math.round(cap)} tuần · chạm vào tên để mở Kho bài theo dạng đó</p></figure></section>`;
}

// Each member's posts as one bar split by pillar in the fixed order, and the pillar she does best against her own average.
function plMembers(m, rows) {
  const list = memberMix(rows, m.members);
  if (!list.length) return '';
  const order = [...PLAN, 'other', 'off_topic', 'none'];
  const used = order.filter((key) => list.some((x) => x.mix.get(key)));
  const row = (x, i) => {
    const prof = m.profiles.get(x.member.id);
    const segs = order.filter((key) => x.mix.get(key)).map((key) => {
      const p = pillarMeta(key);
      const c = x.mix.get(key);
      return `<i style="--pc:${p.color};flex-grow:${c}"${readAttr(`<b>${esc(firstName(x.member.name))} · ${esc(p.vi)}</b> · ${c} bài (${pct(c / x.posts)})`)}></i>`;
    }).join('');
    return `<li class="mm" style="--i:${i}">
      <a class="mm-who" href="#/bang-vang/${esc(x.member.id)}">${prof ? avatar(prof, 34) : ''}<span><b>${esc(firstName(x.member.name))}</b><small>${x.posts} bài</small></span></a>
      <span class="mm-bar">${segs}</span>
      <span class="mm-best">${x.best ? `${pillarTag(x.best.key)}<em>${times(x.best.lift)}</em>` : '<small>Chưa rõ thế mạnh</small>'}</span></li>`;
  };
  return `<section class="bv-panel pl-mm"><header><div><h2>Mỗi người đăng gì</h2><small>Bên phải là dạng bài được xem cao nhất so với các bài khác của người đó</small></div></header>
    <figure class="has-read"><ol>${list.map(row).join('')}</ol>
      <ul class="mm-key">${used.map((key) => `<li><i style="background:${pillarMeta(key).color}"></i>${esc(pillarMeta(key).vi)}</li>`).join('')}</ul>
      <p class="d-read">Chạm vào một màu để xem số bài</p></figure></section>`;
}

/* ----- The table ----- */

// One line per pillar: posts, views per post as a bar with the team's mark, then likes, replies and reposts per 1,000
// views (Nam, 2026-11-04), and the lift on the chosen metric. The chosen metric's column is lit.
function plRow(m, s, p, i, maxAvg, team, pool, mt, primary = 'posts') {
  const open = s.plOpen === p.key;
  const bw = p.avg != null ? Math.sqrt(p.avg / maxAvg) * 100 : 0;
  const tm = team.avg != null ? Math.min(100, Math.sqrt(team.avg / maxAvg) * 100) : null;
  const on = (key) => (primary === key ? ' on' : '');
  const lift = p.lifts?.[mt.key];
  return `<li class="pl-row${open ? ' is-open' : ''}${PLAN.includes(p.key) ? '' : ' is-aside'}" style="--pc:${p.color};--i:${i}">
    <button type="button" class="pl-line" data-pl-open="${p.key}" aria-expanded="${open}">
      <span class="pl-name"><i class="pl-dot" aria-hidden="true"></i><b>${esc(p.vi)}</b></span>
      <span class="pl-num pl-cnt${on('posts')}"><b>${p.posts}</b><small>${pct(p.share)}${s.plCmp && p.deltaPosts ? ` · <span class="pl-d ${p.deltaPosts > 0 ? 'up' : 'down'}">${p.deltaPosts > 0 ? '+' : '−'}${Math.abs(p.deltaPosts)}</span>` : ''}</small></span>
      <span class="pl-med${on('views')}"><span class="pl-mb"><i class="${p.solid ? '' : 'thin'}" style="width:${bw.toFixed(1)}%"></i>${tm != null ? `<s style="left:${tm.toFixed(1)}%"></s>` : ''}</span><b>${k(p.avg)}</b></span>
      <span class="pl-num pl-lk${on('likes')}"><em>Thích</em><b>${pv(p.likeRate)}</b></span>
      <span class="pl-num pl-rep${on('replies')}"><em>Trả lời</em><b>${pv(p.replyRate)}</b></span>
      <span class="pl-num pl-spr${on('reposts')}"><em>Đăng lại</em><b>${pv(p.spread)}</b></span>
      <span class="pl-num pl-lf${on('lift')}">${liftHtml({ ...p, lift })}</span>
      <span class="pl-chev" aria-hidden="true">${icon('down')}</span>
    </button>
    ${open ? plDetail(m, s, p, pool, team, mt) : ''}
  </li>`;
}

// Inside one pillar (Nam, 2026-11-04): its four numbers against the team's, who replies and what readers say, then its
// best posts by the chosen metric, who posts it and its stock.
function plDetail(m, s, p, pool, team, mt) {
  const who = m.members.map((mem) => ({ mem, count: p.rows.filter((r) => r.member.id === mem.id).length })).filter((x) => x.count)
    .sort((a, b) => b.count - a.count);
  const stock = pool?.get(p.key) ?? 0;
  const hits = p.rows.filter((r) => r.views >= HIT_VIEWS).length;
  const tile = (x) => {
    const v = x.of(p);
    const t = x.of(team);
    const l = p.lifts?.[x.key];
    const cls = !p.solid || l == null ? '' : l >= 1.15 ? ' up' : l <= .85 ? ' down' : '';
    const each = x.key === 'views' ? '' : `<small>${x.avg(p) != null ? `${rate(x.avg(p))} mỗi bài` : ''}</small>`;
    return `<div class="pd-m${x.key === mt.key ? ' on' : ''}${cls}"><dt>${x.vi}<span>${x.key === 'views' ? 'mỗi bài' : 'trên lượt xem'}</span></dt>
      <dd><b>${mfmt(x, v)}</b>${l != null ? `<em>${times(l)}</em>` : ''}</dd>
      <p>nhóm ${mfmt(x, t)}${each ? ' · ' : ''}${each}</p></div>`;
  };
  // Who replies and what readers say.
  const voice = replyVoices(p.rows);
  const mixBar = voice.sampled ? (() => {
    const parts = [['reader', 'Người đọc kể chuyện của mình'], ['how_to_train', 'Hỏi cách tập'], ['seller', 'Người bán, quảng cáo']]
      .map(([key, label]) => ({ key, label, n: voice.mix[key] })).filter((x) => x.n);
    return `<div class="pv-mix has-read"><span class="pv-bar">${parts.map((x) => `<i class="pv-${x.key}" style="flex-grow:${x.n}"${readAttr(`<b>${x.label}</b> · ${x.n} trong ${voice.sampled} trả lời đã đọc (${pct(x.n / voice.sampled)})`)}></i>`).join('')}</span>
      <p class="pv-key">${parts.map((x) => `<span><i class="pv-${x.key}"></i>${x.label} <b>${pct(x.n / voice.sampled)}</b></span>`).join('')}</p><p class="d-read">Chạm vào một màu để xem số trả lời</p></div>`;
  })() : '';
  const said = voice.top.length ? `<ol class="pv-top">${voice.top.map((t) => `<li><span class="pv-n">${t.count}</span><span class="pv-t">${t.kind === 'how_to_train' ? '<em>Hỏi cách tập</em>' : ''}${esc(t.theme)}</span>
      ${t.row.source_url ? `<a href="${esc(t.row.source_url)}" target="_blank" rel="noopener" aria-label="Mở bài trên Threads">${icon('out')}</a>` : ''}</li>`).join('')}</ol>` : '';
  const top = p.rows.filter((r) => r.views != null).sort((a, b) => (mt.field(b) ?? 0) - (mt.field(a) ?? 0) || b.views - a.views);
  const shown = s.plAll ? top : top.slice(0, 3);
  return `<div class="pl-detail">
    <p class="pl-hint">${esc(p.hint)} <span>· ${esc(p.en)}</span>${p.solid ? '' : ` <span class="pl-thin">· mới ${p.read} bài có lượt xem, số liệu còn dao động</span>`}</p>
    <dl class="pd-grid">${METRICS.map(tile).join('')}</dl>
    <section class="pv"><p class="pl-sub">Người đọc nói gì${voice.posts ? ` <span>· từ ${voice.sampled} trả lời của ${voice.posts} bài</span>` : ''}</p>
      ${voice.sampled ? `${mixBar}${said || '<p class="pl-calm">Chưa có chủ đề nào của người đọc.</p>'}` : '<p class="pl-calm">Chưa có trả lời nào được đọc cho dạng bài này.</p>'}</section>
    ${shown.length ? `<div class="pl-top"><p class="pl-sub">${mt.key === 'views' ? 'Xem nhiều nhất' : `Nhiều lượt ${mt.vi.toLowerCase()} nhất`}</p><div class="tp-list">${shown.map((r) => postHtml(m, r)).join('')}</div>
      ${top.length > 3 ? `<button type="button" class="btn btn-line sm pl-more" data-pl-all>${s.plAll ? 'Thu gọn' : `Xem cả ${top.length} bài`}</button>` : ''}</div>` : ''}
    <div class="pd-foot">
      ${who.length ? `<div class="pl-people">${who.map(({ mem, count }) => `<a href="#/bang-vang/${esc(mem.id)}" class="pl-person" title="${esc(mem.name)}: ${count} bài">${avatar(m.profiles.get(mem.id), 30)}<span>${esc(firstName(mem.name))}</span><b>${count}</b></a>`).join('')}</div>` : ''}
      <p class="pd-facts">${p.seeding} seeding · ${p.creative} sáng tạo · ${hits ? `${hits} hit · ` : ''}${k(p.views)} lượt xem${pool && PLAN.includes(p.key) ? ` · <a href="#/" data-pl-pool="${p.key}">Kho còn ${stock} bài${icon('right')}</a>` : ''}</p>
    </div>
  </div>`;
}

// Sorting (Nam, 2026-11-04, second try: no adding rows). Every column is a pill in one row, always shown. A tap steps a
// pill through off, Cao → thấp, Thấp → cao and off again; pills that are on sort in the order they were turned on, and
// each shows that number and its arrow. A tap on a column header does the same. The first pill's column is lit in the
// header and the rows, and when it is a rate the page's metric follows it, so the chart and the ranking use one number.
const DIR = { desc: ['Cao → thấp', '↓'], asc: ['Thấp → cao', '↑'] };
// The next rules after a tap on a column: off -> on, high to low, last in order; high to low -> low to high, same place;
// low to high -> off.
// The default (Số bài, high to low, alone) gives way to the first column she turns on, so that tap reorders the table.
function stepSort(rules, key) {
  if (rules.length === 1 && rules[0].key === 'posts' && rules[0].dir === 'desc' && key !== 'posts') return [{ key, dir: 'desc' }];
  const at = rules.findIndex((x) => x.key === key);
  if (at < 0) return [...rules, { key, dir: 'desc' }];
  if (rules[at].dir === 'desc') return rules.map((x, j) => (j === at ? { ...x, dir: 'asc' } : x));
  return rules.filter((_, j) => j !== at);
}
function plSortBar(rules) {
  const plain = rules.length === 1 && rules[0].key === 'posts' && rules[0].dir === 'desc';
  const pill = ([key, label]) => {
    const at = rules.findIndex((x) => x.key === key);
    const rl = rules[at];
    const next = !rl ? 'bật, cao → thấp' : rl.dir === 'desc' ? 'đổi sang thấp → cao' : 'tắt';
    return `<button type="button" class="pp${rl ? (at === 0 ? ' on first' : ' on') : ''}" data-pl-col="${key}" aria-pressed="${Boolean(rl)}"
      title="${label}: chạm để ${next}">${rl && rules.length > 1 ? `<em>${at + 1}</em>` : ''}<span>${label}</span>${rl ? `<i aria-hidden="true">${DIR[rl.dir][1]}</i><small>${DIR[rl.dir][0]}</small>` : ''}</button>`;
  };
  return `<div class="psb" role="group" aria-label="Sắp xếp">
    <div class="psb-top"><span class="psb-l">Sắp xếp theo</span>${plain ? '' : '<button type="button" class="psb-reset" data-psb-reset>Đặt lại</button>'}</div>
    <div class="psb-pills">${SORT_COLS.map(pill).join('')}</div>
    <p class="psb-hint">Chạm để bật, chạm lần nữa để đổi chiều, lần ba để tắt. Bật nhiều cột thì xếp theo thứ tự số.</p>
  </div>`;
}

// The table's own switch (Nam, 2026-11-04): the hero's window, or this week, month or quarter for the table alone.
const PL_TBL = [['week', 'Tuần'], ['month', 'Tháng'], ['quarter', 'Quý']];
function plTblSwitch(s, w) {
  const b = (key, label) => `<button type="button" data-pl-tbl="${key}" aria-pressed="${(s.plTbl ?? 'span') === key}">${label}</button>`;
  return `<div class="seg sm" role="group" aria-label="Khoảng thời gian của bảng">${b('span', w.key === 'all' ? 'Từ đầu' : w.label)}${PL_TBL.map(([key, label]) => b(key, label)).join('')}</div>`;
}

function plTable(m, s, table, team, pool, mt, { ctl = '', when = 'Chạm một dòng để xem bên trong dạng bài' } = {}) {
  const rules = cleanSorts(s.plSorts);
  const primary = rules[0].key;
  const plan = sortPillars(table.filter((p) => PLAN.includes(p.key)), rules, mt.key);
  const aside = sortPillars(table.filter((p) => !PLAN.includes(p.key)), rules, mt.key);
  const maxAvg = Math.max(1, ...table.map((p) => p.avg ?? 0), team.avg ?? 0);
  const rows = (list, from) => list.map((p, i) => plRow(m, s, p, from + i, maxAvg, team, pool, mt, primary)).join('');
  const head = ([key, label]) => {
    const at = rules.findIndex((x) => x.key === key);
    const rl = rules[at];
    const title = rl ? `Đang xếp theo ${label.toLowerCase()}, ${DIR[rl.dir][0].toLowerCase()}. Chạm để ${rl.dir === 'desc' ? 'đổi chiều' : 'tắt'}` : `Chạm để xếp theo ${label.toLowerCase()}`;
    return `<span><button type="button" class="pl-sort${at === 0 ? ' on' : at > 0 ? ' also' : ''}" data-pl-col="${key}" aria-sort="${rl ? (rl.dir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="${title}">${label}<i aria-hidden="true">${rl ? DIR[rl.dir][1] : '↕'}</i>${rl && rules.length > 1 ? `<sup>${at + 1}</sup>` : ''}</button></span>`;
  };
  return `<section class="bv-panel pl-list">
    <header><div><h2>Từng dạng bài</h2><small>${when}</small></div>${ctl}</header>
    ${table.length ? '' : '<p class="bv-calm">Chưa có bài nào trong khoảng này.</p>'}
    ${plSortBar(rules)}
    <div class="pl-head"><span>Dạng bài</span>${SORT_COLS.map(head).join('')}<span></span></div>
    <ol class="pl-rows">${rows(plan, 0)}</ol>
    ${aside.length ? `<p class="pl-group">Ngoài ${PLAN.length} dạng bài chính</p><ol class="pl-rows">${rows(aside, plan.length)}</ol>` : ''}
    <p class="pl-foot">Views: lượt xem trung bình mỗi bài, vạch mảnh là mức của nhóm (${k(team.avg)}). Thích, trả lời, đăng lại: phần trăm trên lượt xem; mức của nhóm là ${pv(team.likeRate)}, ${pv(team.replyRate)} và ${pv(team.spread)}. Dạng bài chưa đủ ${MIN_READ} bài có lượt xem hiện nhạt và xếp sau. Threads không cho xem số lượt chia sẻ.</p>
  </section>`;
}

/* ----- The page ----- */

// The table follows the hero's window unless its own switch picks this week, month or quarter; then it reads that
// period's posts and compares with the period before, when the data reaches back that far.
function plTableFor(m, s, w, { table, team, pool, mt, inside }) {
  const ctl = plTblSwitch(s, w);
  if (!s.plTbl) return plTable(m, { ...s, plCmp: Boolean(w.prev) }, table, team, pool, mt, { ctl });
  const p = periodOf(s.plTbl, m.today);
  const before = prevPeriod(p);
  const rows = ofKind(m.rows.filter(inside(p)), s.plKind);
  const prev = before.from >= m.first ? ofKind(m.rows.filter(inside(before)), s.plKind) : [];
  const when = `${KIND[p.kind][0]} này · ${periodName(p)} · chạm một dòng để xem bên trong`;
  return plTable(m, { ...s, plCmp: before.from >= m.first }, pillarTable(rows, prev, { sort: 'posts' }), groupStats(rows), pool, mt, { ctl, when });
}

function pillarsHtml(m, s) {
  const w = plWindow(m, s);
  const inside = (q) => (r) => r.day >= q.from && r.day <= q.to;
  const rows = ofKind(m.rows.filter(inside(w)), s.plKind);
  const prev = w.prev ? ofKind(m.rows.filter(inside(w.prev)), s.plKind) : [];
  const mt = metricOf(s.plMetric ?? store.get('studio.board.plMetric'));
  const table = pillarTable(rows, prev, { sort: 'posts' });
  const team = groupStats(rows);
  const pool = poolByPillar(m.pool, m.cards ?? []);
  const stock = supply(pool, ofKind(m.rows.filter(inside(w)), 'seeding'), w.weeks);
  const used = table.filter((p) => PLAN.includes(p.key)).length;
  const found = rows.length ? pillarInsights({ table, rows, pool, stock, members: m.members, max: 4 }) : [];
  const span = ([key, label]) => `<button type="button" data-pl-span="${key}" aria-pressed="${w.key === key}">${label}</button>`;
  return `<section class="pl" aria-label="Dạng bài">
    <section class="stage pl-hero">
      <div class="dash-top">
        <div class="dash-title"><p class="eyebrow">Dạng bài${s.plKind === 'all' ? '' : ` · bài ${s.plKind === 'seeding' ? 'seeding' : 'sáng tạo'}`}</p>
          <h2>${w.key === 'all' ? 'Từ đầu' : `${w.label} gần nhất`}<span>${dm(w.from)} – ${dm(w.to)}</span></h2></div>
        <div class="dash-ctl">
          ${kindSwitch('pl-kind', s.plKind, { dark: true })}
          <div class="seg dark" role="group" aria-label="Khoảng thời gian">${PL_SPANS.map(span).join('')}</div>
        </div>
      </div>
      <div class="pl-metric" role="group" aria-label="Đo theo"><span>Đo theo</span>${METRICS.map((x) => `<button type="button" data-pl-metric="${x.key}" aria-pressed="${mt.key === x.key}">${x.vi}</button>`).join('')}
      </div>
      ${rows.length ? `<div class="plh-grid">
        <article class="d-tile plh-mix"><h3>Đăng gì nhiều nhất</h3>${plTreemap(table)}</article>
        <article class="d-tile plh-lift"><h3>${mt.pct ? `Tỷ lệ ${mt.vi.toLowerCase()}` : mt.vi} so với mức chung</h3>${plLiftChart(table, team, mt)}</article>
        <article class="d-tile plh-st"><h3>Tỷ lệ dạng bài qua từng tuần</h3>${plStream(m, s)}</article>
      </div>
      <div class="dash-foot"><p class="bv-alltime"><b>${n(team.posts)}</b> bài · <b>${used}</b>/${PLAN.length} dạng bài · <b>${k(team.avg)}</b> lượt xem mỗi bài · tính trên lượt xem: <b>${pv(team.likeRate)}</b> thích, <b>${pv(team.replyRate)}</b> trả lời, <b>${pv(team.spread)}</b> đăng lại</p></div>`
        : '<p class="pl-empty">Không có bài nào trong khoảng này. Chọn 12 tuần hoặc Từ đầu.</p>'}
    </section>
    ${rows.length ? `${plInsights(m, found, table)}
    ${plTableFor(m, s, w, { table, team, pool, mt, inside })}
    <div class="pl-two">${plSupply(stock, table, m)}${plMembers(m, rows)}</div>` : ''}
  </section>`;
}

function wirePillars(main, m, s, repaint) {
  const root = main.querySelector('.pl');
  if (!root) return;
  fitTreemap(root);
  root.querySelectorAll('[data-pl-span]').forEach((b) => b.addEventListener('click', () => {
    store.set('studio.board.plSpan', b.dataset.plSpan);
    repaint({ plSpan: b.dataset.plSpan, plOpen: null, plAll: false });
  }));
  root.querySelectorAll('[data-pl-kind]').forEach((b) => b.addEventListener('click', () => repaint({ plKind: b.dataset.plKind })));
  root.querySelectorAll('[data-pl-tbl]').forEach((b) => b.addEventListener('click', () => {
    store.set('studio.board.plTbl', b.dataset.plTbl);
    repaint({ plTbl: b.dataset.plTbl === 'span' ? null : b.dataset.plTbl, plOpen: null, plAll: false });
  }));
  // The sort rules live in the browser, so the table opens as she left it.
  const rules = cleanSorts(s.plSorts);
  const setRules = (next) => {
    const clean = cleanSorts(next);
    store.set('studio.board.plSorts', JSON.stringify(clean));
    const lead = clean[0].key;
    const patch = { plSorts: clean, plAll: false };
    if (METRICS.some((x) => x.key === lead)) { patch.plMetric = lead; store.set('studio.board.plMetric', lead); }
    repaint(patch);
  };
  root.querySelectorAll('[data-pl-col]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.plCol;
    setRules(stepSort(rules, key));
  }));
  root.querySelector('[data-psb-reset]')?.addEventListener('click', () => setRules([]));
  // The metric switch (Nam, 2026-11-04): the comparison chart, the lift column, the sort and a pillar's top posts follow it.
  root.querySelectorAll('[data-pl-metric]').forEach((b) => b.addEventListener('click', () => {
    store.set('studio.board.plMetric', b.dataset.plMetric);
    repaint({ plMetric: b.dataset.plMetric, plAll: false });
  }));
  root.querySelectorAll('[data-pl-open]').forEach((b) => b.addEventListener('click', () => repaint({ plOpen: s.plOpen === b.dataset.plOpen ? null : b.dataset.plOpen, plAll: false })));
  root.querySelector('[data-pl-all]')?.addEventListener('click', () => repaint({ plAll: !s.plAll }));
  // Kho bài opens filtered to the pillar.
  root.querySelectorAll('[data-pl-pool]').forEach((a) => a.addEventListener('click', () => {
    try { sessionStorage.setItem(POOL_PILLAR_KEY, a.dataset.plPool); } catch { /* storage blocked */ }
  }));
  wirePillarEdits(root, m, () => repaint({}));
}

// Her posts by pillar on her profile, with the pillar that gets her the most views against the team's on it.
function pillarMineHtml(mine, all) {
  const t = pillarTable(mine, [], { sort: 'posts' });
  if (!t.length) return '';
  const team = new Map(pillarTable(all).map((p) => [p.key, p]));
  const max = Math.max(...t.map((p) => p.posts));
  const best = bestPillar(t, 2);
  return `<section class="bv-panel pl-mine"><header><h2>Dạng bài</h2><small>số bài · trung bình lượt xem</small></header>
    ${best ? `<p class="pl-mine-best">Bài ${pillarTag(best.key)} được xem nhiều nhất<span>trung bình <b>${k(best.avg)}</b> · cả nhóm ${k(team.get(best.key)?.avg)}</span></p>` : ''}
    <ul class="pl-bars">${t.map((p) => `<li class="${PLAN.includes(p.key) ? '' : 'is-aside'}" style="--pc:${p.color}" title="${esc(p.en)}"><span class="pl-bn"><i class="pl-dot" aria-hidden="true"></i>${esc(p.vi)}</span>
      <span class="pl-bt"><i style="--w:${((p.posts / max) * 100).toFixed(1)}%"></i></span><b>${p.posts}</b><small>${k(p.avg)}</small></li>`).join('')}</ul></section>`;
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
  // Two tabs, each its own card with an icon (Nam, 2026-11-04), so the one open reads at a glance.
  const tab = (view, label, sub, ic) => `<button type="button" role="tab" data-view="${view}" aria-selected="${s.view === view}"><span class="bs-ic" aria-hidden="true">${icon(ic)}</span><span class="bs-tx"><b>${label}</b><small>${sub}</small></span></button>`;
  main.innerHTML = `<div class="bv${first ? '' : ' is-still'}">
    ${dashHtml(m, s)}
    <div class="bv-switch" role="tablist" aria-label="Chọn phần">${tab('game', 'Thi đua', 'Xếp hạng và bài của nhóm', 'trophy')}${tab('pillars', 'Content pillars', 'Số liệu theo dạng bài', 'stats')}</div>
    <div class="bv-view" role="tabpanel">${s.view === 'pillars' ? pillarsHtml(m, s) : gameHtml(m, s)}</div>
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
    repaint({ period: periodOf(b.dataset.kind, min(s.period.to, m.today)), shown: PAGE, lbKind: null, feedPeriod: null });
  }));
  main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    repaint({ period: periodOf(s.period.kind, b.dataset.go), shown: PAGE, lbKind: null, feedPeriod: null });
  }));
  wireBoardSwitch(main, m, s);
  main.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    // Bảng vàng always opens on Thi đua (Nam, 2026-11-05); a switch holds only until she leaves the page.
    repaint({ view: b.dataset.view });
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
  // A member fixes a pillar on any post on the page; the feed wires its own posts again, so a fix there redraws only it.
  wirePillarEdits(main, m, () => repaint({}));
  wireFeed(main, m, s);
  wirePillars(main, m, s, repaint);
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
        ${pillarMineHtml(p.rows, all)}
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
  wirePillarEdits(main, m, () => again({}));
}
