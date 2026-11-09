// Tăng trưởng (Nam, 2026-11-09): the chain from a Threads view to a finished workout, how each link moves over weeks,
// months and quarters, and what the team shipped around each change. Everything here is a real number:
//   Threads views of our posts and their link replies: Studio's own readings (observations, link_observations).
//   The app's steps and returns: PostHog, written to growth_metrics by vika-ops tools/portal/growth.cjs.
//   App Store page views and first-time downloads: Apple's App Analytics by day, through its newest day (asc_through),
//   written to growth_metrics by vika-ops tools/portal/appstore.cjs. Apple counts a device's first download and PostHog
//   a person's first open; a reinstall or a new phone is new to PostHog only, so the link between them shows no rate.
import { loadAnalytics, loadGrowth } from '../data.js?v=20261109a';
import { vnDate, mondayOf, addDays } from '../lib/week.js?v=20261109a';

const LIVE = '2026-08-03';
// Each step and the first period it was measured in whole. A rate shows only when both its steps were measured for the
// whole period: buổi tập is tracked in the app since 2026-10-26.
const STEPS = [
  { key: 'views', name: 'Xem bài Threads', short: 'Xem bài', group: 'Threads' },
  { key: 'r2', name: 'Xem bình luận có link', short: 'Xem link', group: 'Threads' },
  { key: 'store', name: 'Xem trang App Store', short: 'App Store', group: 'App Store', apple: true },
  { key: 'dl', name: 'Tải lần đầu', short: 'Tải về', group: 'App Store', apple: true },
  { key: 'new', name: 'Mở app lần đầu', short: 'Mở app', group: 'Trong app', from: LIVE },
  { key: 'onboard', name: 'Xong onboarding', short: 'Onboarding', group: 'Trong app', from: '2026-09-07' },
  { key: 'start', name: 'Bắt đầu buổi tập', short: 'Bắt đầu tập', group: 'Trong app', from: '2026-10-26' },
  { key: 'done', name: 'Xong buổi tập', short: 'Xong buổi', group: 'Trong app', from: '2026-10-26' },
];
// What the team shipped (Vinafit_mobile release notes and Studio's log).
const CHANGES = [
  { n: 1, date: '2026-09-07', day: '7/9', kind: 'App', title: 'App 1.1.1: giao diện và onboarding mới' },
  { n: 2, date: '2026-09-25', day: '25/9', kind: 'Studio', title: 'Cả nhóm đăng bài từ Kho bài' },
  { n: 3, date: '2026-10-06', day: '6/10', kind: 'Threads', title: 'Một tài khoản bị Threads khoá' },
  { n: 4, date: '2026-10-31', day: '31/10', kind: 'App', title: 'App 1.1.2 và trang App Store mới' },
  { n: 5, date: '2026-11-04', day: '4/11', kind: 'Studio', title: 'Bảng vàng, link theo tài khoản' },
];
const UNIT = { week: 'tuần', month: 'tháng', quarter: 'quý' };

let ROOT = document;
const el = (id) => ROOT.querySelector(`#${id}`);
const dm = (iso) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const days = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5;
const fmt = (v) => v == null ? '–' : v >= 10000 ? `${(v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}K` : Math.round(v).toLocaleString('vi-VN');
const pct = (v) => v == null ? '–' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: v < 10 ? 1 : 0 })}%`;
const narrow = () => matchMedia('(max-width: 900px)').matches;

/* ---------- Periods and series ---------- */

let RAW = null, TODAY = vnDate(), mode = 'week', V, cur, metric = 'new', rel = null;

function periods(kind) {
  const out = [];
  const startOf = (d) => kind === 'week' ? mondayOf(d) : kind === 'month' ? `${d.slice(0, 7)}-01`
    : `${d.slice(0, 4)}-${String(Math.floor((+d.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  const next = (s) => { if (kind === 'week') return addDays(s, 7); const y = +s.slice(0, 4), m = +s.slice(5, 7) + (kind === 'month' ? 1 : 3);
    return `${y + Math.floor((m - 1) / 12)}-${String((m - 1) % 12 + 1).padStart(2, '0')}-01`; };
  for (let s = startOf(LIVE); s <= TODAY; s = next(s)) {
    const end = next(s), y = s.slice(0, 4), mo = +s.slice(5, 7);
    const name = kind === 'week' ? `${dm(s)} – ${dm(addDays(s, 6))}` : kind === 'month' ? `Tháng ${mo}/${y}` : `Quý ${(mo + 2) / 3}/${y}`;
    const short = kind === 'week' ? dm(s) : kind === 'month' ? `T${mo}` : `Q${(mo + 2) / 3}`;
    out.push({ start: s, end, name, short, partial: end > addDays(TODAY, 1) });
  }
  return out;
}

function build(kind) {
  const groups = periods(kind);
  const at = (day) => groups.findIndex((g) => day >= g.start && day < g.end);
  const blank = () => groups.map(() => null);
  const add = (arr, i, v) => { if (i >= 0 && v != null) arr[i] = (arr[i] ?? 0) + v; };
  // Threads: each post's newest reading, counted in the period it went up.
  const newest = (list, key) => { const m = new Map(); for (const x of list) { const had = m.get(x[key]); if (!had || x.captured_at > had.captured_at) m.set(x[key], x); } return m; };
  const obs = newest(RAW.a.observations, 'post_id'), link = newest(RAW.a.links, 'post_id');
  const views = blank(), r2 = blank(), linkPosts = groups.map(() => [0, 0]);
  const appLink = /apps\.apple\.com\/\S*id6768359920|[?&]ct=/i;
  const r2Text = new Map(); for (const v of RAW.a.versions) if (v.r2) r2Text.set(v.post_id, v.r2);
  for (const p of RAW.a.posts) {
    const i = at(vnDate(new Date(p.published_at)));
    if (i < 0) continue;
    add(views, i, obs.get(p.id)?.views);
    if (p.ct || appLink.test(r2Text.get(p.id) ?? '')) { linkPosts[i][0]++; if (link.has(p.id)) { linkPosts[i][1]++; add(r2, i, link.get(p.id).r2_views); } }
  }
  const firstPost = RAW.a.posts.map((p) => vnDate(new Date(p.published_at))).sort()[0] ?? TODAY;
  // PostHog rows for this period kind.
  const ph = (metricKey) => { const out = blank(); for (const r of RAW.g) if (r.kind === kind && r.metric === metricKey) { const i = groups.findIndex((g) => g.start === r.start); if (i >= 0) out[i] = +r.value; } return out; };
  const s = STEPS.map((st) => st.key === 'views' ? views : st.key === 'r2' ? r2 : ph(st.key));
  const through = RAW.g.filter((r) => r.metric === 'asc_through').map((r) => r.start).sort().at(-1) ?? null;
  const cov = STEPS.map((st, j) => groups.map((g, i) => {
    if (s[j][i] == null) return false;
    if (st.apple) return through != null && g.start >= LIVE && g.end <= addDays(through, 1);
    if (st.key === 'views') return g.start >= mondayOf(firstPost);
    if (st.key === 'r2') return linkPosts[i][0] > 0 && linkPosts[i][1] / linkPosts[i][0] >= 0.8;
    return g.start >= st.from;
  }));
  // Weekly cohorts: size and how many opened the app again k weeks later; grouped into the period of their Monday.
  const weekly = new Map();
  for (const r of RAW.g) if (r.kind === 'week' && (r.metric === 'size' || r.metric.startsWith('back'))) {
    const c = weekly.get(r.start) ?? { start: r.start, back: [] }; if (r.metric === 'size') c.size = +r.value; else c.back[+r.metric.slice(4) - 1] = +r.value; weekly.set(r.start, c);
  }
  const cohortsAll = [...weekly.values()].filter((c) => c.size >= 10).sort((a, b) => a.start.localeCompare(b.start));
  const cohorts = groups.map((g) => {
    const cs = cohortsAll.filter((c) => c.start >= g.start && c.start < g.end);
    if (!cs.length) return null;
    const size = cs.reduce((x, c) => x + c.size, 0);
    const back = [0, 1, 2, 3, 4, 5].map((k) => { const has = cs.filter((c) => c.back[k] != null); if (!has.length || has.length < cs.length) return null;
      return has.reduce((x, c) => x + c.back[k], 0) / has.reduce((x, c) => x + c.size, 0) * 100; });
    return { label: kind === 'week' ? dm(g.start) : g.short, size, back: back.slice(0, back.indexOf(null) < 0 ? 6 : back.indexOf(null)) };
  });
  const w2 = cohorts.map((c) => c?.back[0] ?? null);
  return { m: kind, groups, cov, n: groups.length, s, tr: s[7], w2, cohorts, unit: UNIT[kind], through };
}

// Two links have no rate, because their two numbers come from counters that do not match. Xem link → App Store: Threads
// counts no link taps, and a link tap opens the App Store app, which Apple rarely counts as a page view (a link code
// with 57 downloads showed 1 page view on 2026-11-09), while the page views it counts come from every source.
// Tải về → Mở app: Apple counts devices, PostHog people (see the top of the file).
const NO_RATE = new Map([[1, 'Threads không đếm lượt bấm link, và Apple gần như không tính lượt bấm link là lượt xem trang; hai số không chia cho nhau được'],
  [3, 'Apple đếm máy tải lần đầu, PostHog đếm người mở app lần đầu; hai số không chia cho nhau được']]);
const rate = (j, i) => { if (NO_RATE.has(j) || i < 0 || !V.cov[j][i] || !V.cov[j + 1][i]) return null; const a = V.s[j][i], b = V.s[j + 1][i]; return a && b != null ? b / a * 100 : null; };
const relAt = (c) => { const i = V.groups.findIndex((g) => c.date >= g.start && c.date < g.end); const g = V.groups[i]; return { i, f: i < 0 ? 0 : days(g.start, c.date) / days(g.start, g.end) }; };
const partialChip = () => `<span class="chip flat">${V.unit} chưa hết · đến ${dm(TODAY)}</span>`;
function delta(now, before, unit = '', cls = 'chip') {
  if (now == null || before == null) return `<span class="${cls} flat">chưa có ${V.unit} trước</span>`;
  const d = Math.round(now - before);
  if (d === 0) return `<span class="${cls} flat">bằng ${V.unit} trước</span>`;
  return `<span class="${cls} ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toLocaleString('vi-VN')}${unit}</span>`;
}
function weakest(i) { let at = -1, low = Infinity; for (let j = 0; j < STEPS.length - 1; j++) { const r = rate(j, i); if (r != null && r < low) { low = r; at = j; } } return at; }

/* ---------- Pieces ---------- */

// A 270° dial. frac 0..1.
function dial(frac, size, weak) {
  const c = size / 2, r = c - 4, a0 = 135, sweep = 270;
  const pt = (deg) => { const a = deg * Math.PI / 180; return `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`; };
  const arc = (f) => { const e = a0 + sweep * f; return `M${pt(a0)} A${r},${r} 0 ${sweep * f > 180 ? 1 : 0} 1 ${pt(e)}`; };
  const f = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path class="trk" d="${arc(1)}"/>${f > 0 ? `<path class="val${weak ? ' weak' : ''}" d="${arc(Math.max(.012, f))}"/>` : ''}</svg>`;
}

// Area sparkline across all periods, a dot on the open one.
function spark(vals, i, W, H, opts = {}) {
  const pts = vals.map((v, k) => v == null ? null : [k, v]).filter(Boolean);
  if (!pts.length) return '<div class="spark"></div>';
  const max = opts.max ?? Math.max(1, ...pts.map((p) => p[1])) * 1.08, L = 2, R = 4, T = 6, B = 14, n = Math.max(2, vals.length);
  const x = (k) => L + k / (n - 1) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
  const line = pts.map(([k, v], m) => `${m ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.at(-1)[0]).toFixed(1)},${H - B} L${x(pts[0][0]).toFixed(1)},${H - B} Z`;
  const id = `sg${Math.random().toString(36).slice(2, 8)}`;
  const dot = vals[i] == null ? '' : `<circle class="dt" cx="${x(i)}" cy="${y(vals[i])}" r="3.5"/>`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5b33a" stop-opacity=".32"/><stop offset="1" stop-color="#e5b33a" stop-opacity="0"/></linearGradient></defs>
    <line class="base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><path class="a" fill="url(#${id})" d="${area}"/><path class="ln" d="${line}"/>${dot}
    <text class="wl" x="${L}" y="${H - 1}">${V.groups[0].short}</text><text class="wl" x="${W - R}" y="${H - 1}" text-anchor="end">${V.groups.at(-1).short}</text></svg>`;
}

/* ---------- Hero ---------- */
function renderHero() {
  const i = cur, part = V.groups[i].partial;
  // The newest cohort whose week after has ended.
  let w2i = i; while (w2i >= 0 && V.w2[w2i] == null) w2i--;
  const tiles = [
    { l: 'Lượt tải', v: V.s[3], f: fmt, apple: true },
    { l: 'Người mới mở app', v: V.s[4], f: fmt },
    { l: 'Người tập xong 1 buổi', v: V.tr, f: fmt, gold: true, from: '26/10' },
    { l: 'Quay lại tuần sau', sub: w2i >= 0 ? `nhóm ${V.cohorts[w2i].label}` : '', v: V.w2, at: w2i, f: pct, unit: ' điểm', max: 60, rate: true },
  ];
  const box = el('hero');
  box.innerHTML = tiles.map((t) => { const at = t.at ?? i, v = at >= 0 ? t.v[at] : null;
    const chip = part && !t.rate ? partialChip() : t.apple && v != null && !V.cov[3][at] ? `<span class="chip flat">số Apple đến ${dm(V.through)}</span>`
      : delta(v, at > 0 ? t.v[at - 1] : null, t.unit);
    return `<div class="kpi"><div class="l">${t.l}${t.sub ? ` <em>· ${t.sub}</em>` : ''}</div>
      <div class="v num${t.gold ? ' gold' : ''}">${v == null ? '–' : t.f(v)}</div><div>${chip}</div><div class="sp"></div></div>`; }).join('');
  box.querySelectorAll('.sp').forEach((s, k) => { const t = tiles[k];
    s.outerHTML = spark(t.v, t.at ?? i, Math.round(s.parentElement.clientWidth - 44) || 200, narrow() ? 44 : 54, { max: t.max }); });
}

/* ---------- The chain ---------- */
function renderFlow() {
  const i = cur, weak = weakest(i), box = el('flow'), tip = el('ftip');
  el('chain-title').textContent = `Chuỗi của ${V.unit}`;
  el('prev-lbl').textContent = `mức ${V.unit} trước`;
  el('weak-chip').innerHTML = weak < 0 ? '' : `<i></i>Yếu nhất: ${STEPS[weak].short} → ${STEPS[weak + 1].short} · ${pct(rate(weak, i))}`;
  el('weak-chip').hidden = weak < 0;
  [...box.children].forEach((c) => { if (c !== tip) c.remove(); });
  const dd = (j) => { const r = rate(j, i), rb = rate(j, i - 1); if (r == null || rb == null) return ''; const d = Math.round(r - rb);
    return Math.abs(d) < 1 ? '<span class="flat">=</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`; };
  const top = Math.max(10, ...V.s.flat().filter((v) => v != null));
  const lmax = Math.min(7, Math.max(5, Math.ceil(Math.log10(top))));
  const frac = (v) => v == null || v <= 0 ? 0 : Math.max(.012, Math.log10(Math.max(1, v)) / lmax + (v < 2 ? .012 : 0));
  const val = (j, at) => (at >= 0 ? V.s[j][at] : null);
  const shown = (j, v) => (v != null ? '' : STEPS[j].apple ? 'chờ số Apple' : 'chưa đo');
  const dialTitle = (j, r) => NO_RATE.has(j) ? NO_RATE.get(j)
    : `${STEPS[j].short} → ${STEPS[j + 1].short}: ${r == null ? 'chưa đo' : `${pct(r)} đi tiếp`}`;

  if (narrow()) {
    let last = '', h = '<div class="vflow">';
    STEPS.forEach((st, j) => {
      if (st.group !== last) { h += `<div class="vg">${st.group}</div>`; last = st.group; }
      const v = val(j, i), p = val(j, i - 1);
      h += `<div class="vs${st.wait ? ' wait' : ''}"><div class="vs-top"><span>${st.name}</span><b class="num">${v == null ? `<small>${shown(j, v)}</small>` : fmt(v)}</b></div>
        <div class="vbar"><i style="width:${frac(v) * 100}%"></i>${p != null ? `<u style="left:${frac(p) * 100}%"></u>` : ''}</div></div>`;
      if (j < STEPS.length - 1) { const r = rate(j, i);
        h += `<button type="button" class="vl${j === weak ? ' weak' : ''}" data-j="${j}"><span class="ring">${dial(r == null ? null : r / 100, 40, j === weak)}<b>${r == null ? '–' : pct(r).replace('%', '')}</b></span>
          <span class="vt">${r == null ? 'chưa đo' : 'đi tiếp'}${j === weak ? ' · yếu nhất' : ''}</span><span class="dd">${dd(j)}</span></button>`; }
    });
    box.insertAdjacentHTML('beforeend', `${h}</div>`);
  } else {
    const W = box.clientWidth, AX = 34, G = 56, n = STEPS.length, sw = (W - AX - G * (n - 1)) / n, H = 200, T = 6;
    box.style.setProperty('--cols', `${AX}px ${Array(n).fill('minmax(0,1fr)').join(` ${G}px `)}`);
    const sx = (j) => AX + j * (sw + G), y = (v) => H - frac(v) * (H - T);
    let svg = `<svg class="fsv" viewBox="0 0 ${W} ${H}" style="height:${H}px">`;
    for (let e = 0; e <= lmax; e++) { const yy = H - e / lmax * (H - T);
      svg += `<line class="gl" x1="${AX}" x2="${W}" y1="${yy}" y2="${yy}"/><text class="gt" x="${AX - 8}" y="${yy + 3.5}" text-anchor="end">${['1', '10', '100', '1K', '10K', '100K', '1M', '10M'][e]}</text>`; }
    STEPS.forEach((st, j) => { if (j === n - 1) return; const a = val(j, i), b = val(j + 1, i); if (a == null || b == null) return;
      const x1 = sx(j) + sw, x2 = sx(j + 1), m = (x1 + x2) / 2;
      svg += `<path class="rib${j === weak ? ' weak' : ''}" d="M${x1},${y(a)} C${m},${y(a)} ${m},${y(b)} ${x2},${y(b)} L${x2},${H} L${x1},${H} Z"/>`; });
    STEPS.forEach((st, j) => { const v = val(j, i), p = val(j, i - 1), x = sx(j);
      if (v != null) { const tp = y(v), h = H - tp, r = Math.min(7, h / 2);
        svg += `<path class="bar" d="M${x},${H} V${tp + r} Q${x},${tp} ${x + r},${tp} H${x + sw - r} Q${x + sw},${tp} ${x + sw},${tp + r} V${H} Z"/>`; }
      else svg += `<rect class="wait" x="${x}" y="${T}" width="${sw}" height="${H - T}" rx="7"/>`;
      if (p != null) svg += `<line class="prev" x1="${x - 4}" x2="${x + sw + 4}" y1="${y(p)}" y2="${y(p)}"/>`;
      svg += `<rect class="hit" data-j="${j}" x="${x - 4}" y="0" width="${sw + 8}" height="${H}"/>`; });
    svg += '</svg>';
    const dials = STEPS.slice(0, -1).map((st, j) => { const r = rate(j, i);
      return `<button type="button" class="dial${j === weak ? ' weak' : ''}" data-j="${j}" style="grid-column:${3 + 2 * j}" title="${dialTitle(j, r)}">
        <span class="ring">${dial(r == null ? null : r / 100, 50, j === weak)}<b>${r == null ? '–' : pct(r)}</b></span><span class="dd">${dd(j)}</span></button>`; }).join('');
    const labels = STEPS.map((st, j) => { const v = val(j, i);
      return `<div class="lab${v == null ? ' none' : ''}" style="grid-column:${2 + 2 * j}"><b class="num">${v == null ? '–' : fmt(v)}</b><span>${st.short}</span>${v == null ? `<small>${shown(j, v)}</small>` : ''}</div>`; }).join('');
    const span = (g) => { const js = STEPS.map((s, j) => (s.group === g ? j : -1)).filter((j) => j >= 0); return `${2 + 2 * js[0]} / ${3 + 2 * js.at(-1)}`; };
    const groups = ['Threads', 'App Store', 'Trong app'].map((g) => `<div class="grp" style="grid-column:${span(g)}">${g}</div>`).join('');
    box.insertAdjacentHTML('beforeend', `<div class="frow dials">${dials}</div>${svg}<div class="frow labels">${labels}</div><div class="frow groups">${groups}</div>`);
    box.querySelectorAll('.hit').forEach((h) => {
      h.onmouseenter = () => { const j = +h.dataset.j, st = STEPS[j], v = val(j, i), p = val(j, i - 1);
        tip.innerHTML = `<small>${st.name} · ${V.groups[i].name}</small><b>${v == null ? shown(j, v) : fmt(v)}</b> <span style="color:var(--on-dark-muted)">${V.unit} trước ${fmt(p)}</span>`;
        const svgTop = box.querySelector('.fsv').offsetTop;
        tip.style.left = `${Math.min(Math.max(0, sx(j) + sw / 2 - 80), W - tip.offsetWidth)}px`;
        tip.style.top = `${svgTop + (v == null ? H / 2 : y(v)) - tip.offsetHeight - 10}px`; tip.style.opacity = 1; };
      h.onmouseleave = () => { tip.style.opacity = 0; };
    });
  }
  box.querySelectorAll('button[data-j]').forEach((b) => { b.onclick = () => { metric = `l${b.dataset.j}`; rel = null; renderTrend(); el('trend-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
}

/* ---------- Over time ---------- */
const METRICS = () => [
  { id: 'done', label: 'Người tập', kind: 'col', vals: V.tr, f: fmt, note: 'người xong ít nhất 1 buổi' },
  { id: 'dl', label: 'Lượt tải', kind: 'col', vals: V.s[3], f: fmt, note: 'lượt tải lần đầu trên App Store' },
  { id: 'new', label: 'Người mới mở app', kind: 'col', vals: V.s[4], f: fmt, note: 'người mở app lần đầu' },
  { id: 'views', label: 'Lượt xem bài', kind: 'col', vals: V.s[0], f: fmt, note: 'lượt xem các bài đăng trong kỳ' },
  { id: 'r2', label: 'Xem link', kind: 'col', vals: V.s[1], f: fmt, note: 'lượt xem bình luận có link' },
  { id: 'w2', label: 'Quay lại tuần sau', kind: 'line', vals: V.w2, f: pct, max: 100, note: 'người mới mở lại app ở tuần sau' },
  ...STEPS.slice(0, -1).map((st, j) => ({ id: `l${j}`, link: true, label: `${st.short} → ${STEPS[j + 1].short}`, kind: 'line', vals: V.groups.map((_, i) => rate(j, i)), f: pct, max: 100, note: 'đi tiếp sang bước sau' })),
];
const M = () => METRICS().find((m) => m.id === metric) ?? METRICS()[1];

function renderTrend() {
  const ms = METRICS(), m = M();
  el('chips').innerHTML = ms.filter((x) => !x.link || x.id === metric).map((x) => `<button type="button" data-id="${x.id}" aria-pressed="${x.id === m.id}">${x.label}${x.link ? '<span class="x">×</span>' : ''}</button>`).join('');
  el('chips').querySelectorAll('button').forEach((b) => { b.onclick = () => { const id = b.dataset.id; metric = ms.find((x) => x.id === id).link && id === metric ? 'new' : id; renderTrend(); }; });
  const v = m.vals[cur], part = V.groups[cur].partial && m.kind === 'col';
  el('tr-big').textContent = v == null ? '–' : m.f(v);
  el('tr-sub').innerHTML = `${part ? `<span class="flat">${V.unit} chưa hết, đến ${dm(TODAY)}</span>` : delta(v, m.vals[cur - 1], m.kind === 'line' ? ' điểm' : '', 'd')} · ${m.note} · ${V.groups[cur].name}`;
  renderChart(m); renderRels(m);
}

const K = () => (V.m === 'week' ? 3 : 1);
function avgWin(m, c) {
  const { i } = relAt(c), k = K(), pick = (a, b) => m.vals.slice(Math.max(0, a), b).filter((v) => v != null);
  const bef = pick(i - k, i), aft = pick(i, i + k), avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const part = m.kind === 'col' && V.m !== 'week' && V.groups.slice(i, i + k).some((g) => g.partial);
  return { i, bef, aft, part, b: bef.length ? avg(bef) : null, a: aft.length && !part ? avg(aft) : null };
}

function renderChart(m) {
  const svg = el('trend');
  const W = Math.round(Math.max(300, svg.parentElement.clientWidth || 700)), H = W < 560 ? 230 : 290, L = 42, R = 6, T = 34, B = 26;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.height = `${H}px`;
  const n = V.n, bw = (W - L - R) / n, vals = m.vals;
  const top = Math.max(1, ...vals.filter((v) => v != null));
  const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)) / 2; return Math.max(4, Math.ceil(v / (p * 4)) * p * 4); };
  const max = m.max && top <= m.max ? (top < m.max / 2 ? nice(top * 1.15) : m.max) : nice(top * 1.1);
  const y = (v) => H - B - v / max * (H - T - B), cx = (i) => L + i * bw + bw / 2;
  const every = V.m !== 'week' ? 1 : W < 560 ? 3 : 2, R0 = rel ? CHANGES[rel - 1] : null, win = R0 ? avgWin(m, R0) : null, k = K();
  let g = '';
  if (win) { const xb = L + Math.max(0, win.i - k) * bw, xi = L + win.i * bw, xa = L + Math.min(n, win.i + k) * bw;
    g += `<rect class="band-b" x="${xb}" y="${T}" width="${xi - xb}" height="${H - T - B}" rx="6"/><rect class="band-a" x="${xi}" y="${T}" width="${xa - xi}" height="${H - T - B}" rx="6"/>`; }
  g += '<g class="grid">';
  for (let t = 0; t <= 4; t++) g += `<line x1="${L}" x2="${W - R}" y1="${y(max * t / 4)}" y2="${y(max * t / 4)}"/>`;
  g += '</g><g class="axis">';
  for (let t = 0; t <= 4; t++) g += `<text x="${L - 8}" y="${y(max * t / 4) + 4}" text-anchor="end">${m.kind === 'line' ? `${Math.round(max * t / 4)}%` : fmt(max * t / 4)}</text>`;
  V.groups.forEach((gr, i) => { if ((n - 1 - i) % every === 0) g += `<text x="${cx(i)}" y="${H - 6}" text-anchor="middle">${V.m === 'week' ? gr.short : gr.name.replace('Tháng ', 'T').replace('Quý ', 'Q')}</text>`; });
  g += '</g>';
  let mk = '';
  const pr = Math.min(9, Math.max(6, bw / 2 - 2)), placed = [];
  CHANGES.forEach((c) => { const { i, f } = relAt(c); if (i < 0) return; const x = L + (i + f) * bw, on = rel === c.n ? ' on' : '';
    let py = T - 18; while (placed.some((p) => Math.abs(p.x - x) < pr * 2 + 2 && p.y === py)) py -= pr * 2 + 3; placed.push({ x, y: py });
    mk += `<line class="mk${on}" x1="${x}" x2="${x}" y1="${py + pr}" y2="${H - B}"/><g class="pin${on}" data-n="${c.n}"><circle cx="${x}" cy="${py}" r="${pr}"/><text x="${x}" y="${py + 3.5}" text-anchor="middle">${c.n}</text></g>`; });
  let marks = '';
  const first = vals.findIndex((v) => v != null);
  if (first > 1) marks += `<text class="gap" x="${L + first * bw / 2}" y="${H - B - 10}" text-anchor="middle">chưa đo</text>`;
  const inWin = (i) => !win || (i >= win.i - k && i < win.i + k);
  if (m.kind === 'col') {
    vals.forEach((v, i) => { if (v == null) return; const w = Math.min(V.m === 'week' ? 24 : 64, bw * 0.55), x = cx(i) - w / 2, h = Math.max(2, H - B - y(v)), r = Math.min(4, h / 2);
      const part = V.groups[i].partial;
      const cls = !inWin(i) ? ' dim' : part ? ' part' : i === cur ? ' cur' : '';
      marks += `<path class="col${cls}" d="M${x},${H - B} V${H - B - h + r} q0,-${r} ${r},-${r} h${w - 2 * r} q${r},0 ${r},${r} V${H - B} Z"/>`;
      if (part) marks += `<text class="pl" x="${cx(i)}" y="${H - B - h - 7}" text-anchor="middle">đến ${dm(TODAY)}</text>`; });
  } else {
    let d = '', open = false; const segs = []; let cs = [];
    vals.forEach((v, i) => { if (v == null) { open = false; if (cs.length) segs.push(cs); cs = []; return; } d += `${open ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)} `; cs.push(i); open = true; });
    if (cs.length) segs.push(cs);
    segs.forEach((s) => { if (s.length > 1) marks += `<path class="area" d="M${cx(s[0])},${H - B} ${s.map((i) => `L${cx(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ')} L${cx(s.at(-1))},${H - B} Z"/>`; });
    marks += `<path class="ln" d="${d}"/>${vals.map((v, i) => (v == null ? '' : `<circle class="dot" cx="${cx(i)}" cy="${y(v)}" r="${i === cur ? 5 : 3}"/>`)).join('')}`;
  }
  if (win && win.b != null && win.a != null) { const xb = L + Math.max(0, win.i - k) * bw, xi = L + win.i * bw, xa = L + Math.min(n, win.i + k) * bw;
    marks += `<line class="avg" x1="${xb + 4}" x2="${xi - 4}" y1="${y(win.b)}" y2="${y(win.b)}"/><text class="avgt" x="${xb + 6}" y="${y(win.b) - 6}">TB ${m.f(win.b)}</text>
      <line class="avg a" x1="${xi + 4}" x2="${xa - 4}" y1="${y(win.a)}" y2="${y(win.a)}"/><text class="avgt a" x="${xa - 6}" y="${y(win.a) - 6}" text-anchor="end">TB ${m.f(win.a)}</text>`; }
  const hits = V.groups.map((gr, i) => `<rect class="hit" data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}"/>`).join('');
  svg.innerHTML = `${g}${mk}<line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}"/>${marks}${hits}`;
  const tip = el('tip'), cross = svg.querySelector('.cross');
  svg.querySelectorAll('.hit').forEach((r) => {
    r.onmouseenter = () => { const i = +r.dataset.i, v = vals[i], gr = V.groups[i];
      tip.innerHTML = `<small>${gr.name}${gr.partial ? ` · đến ${dm(TODAY)}` : ''}</small><b>${v == null ? 'chưa đo' : m.f(v)}</b> <span style="color:var(--on-dark-muted)">${m.note}</span>`;
      const s = svg.getBoundingClientRect().width / W;
      tip.style.left = `${Math.min(Math.max(0, cx(i) * s - 70), svg.getBoundingClientRect().width - tip.offsetWidth)}px`;
      tip.style.top = `${(v == null ? T : y(v)) * s - tip.offsetHeight - 10}px`; tip.style.opacity = 1;
      cross.setAttribute('x1', cx(i)); cross.setAttribute('x2', cx(i)); cross.style.opacity = 0.15; };
    r.onmouseleave = () => { tip.style.opacity = 0; cross.style.opacity = 0; };
  });
  svg.querySelectorAll('.pin').forEach((p) => { p.onclick = () => pickRel(+p.dataset.n); });
}

function pickRel(n) { rel = rel === n ? null : n; renderChart(M()); renderRels(M()); }

function renderRels(m) {
  el('rels').innerHTML = CHANGES.map((c) => {
    const w = avgWin(m, c);
    let ba = w.part ? `<span class="na">Chờ hết ${V.unit} để so</span>` : '<span class="na">Chưa đủ số để so</span>';
    if (w.b != null && w.a != null) {
      const mx = Math.max(w.b, w.a) || 1, hb = Math.max(2, w.b / mx * 30), ha = Math.max(2, w.a / mx * 30), cls = w.a > w.b ? 'up' : w.a < w.b ? 'down' : '';
      ba = `<svg width="34" height="32" viewBox="0 0 34 32"><rect x="2" y="${32 - hb}" width="12" height="${hb}" rx="3" fill="var(--recede)"/><rect x="18" y="${32 - ha}" width="12" height="${ha}" rx="3" fill="${cls === 'down' ? 'var(--warn)' : 'var(--s1)'}"/></svg>
        <span class="vals">${m.f(w.b)} → <b class="${cls}">${m.f(w.a)}</b></span>`;
    }
    return `<button type="button" class="rc${rel === c.n ? ' on' : ''}" data-n="${c.n}"><span class="rc-top"><span class="n">${c.n}</span>${c.day}<span class="k">${c.kind}</span></span>
      <span class="rc-t">${c.title}</span><span class="rc-ba">${ba}</span></button>`;
  }).join('');
  el('rels').querySelectorAll('.rc').forEach((b) => { b.onclick = () => pickRel(+b.dataset.n); });
  const c = rel ? CHANGES[rel - 1] : null, w = c ? avgWin(m, c) : null;
  const how = V.m === 'week' ? 'Mỗi thẻ so trung bình 3 tuần trước với tuần ra mắt và 2 tuần sau.'
    : `Mỗi thẻ so ${V.unit} trước với ${V.unit} có thay đổi. ${V.unit[0].toUpperCase()}${V.unit.slice(1)} có thay đổi gồm cả những ngày trước khi ra mắt.`;
  el('tr-note').textContent = !c || V.m !== 'week' ? how : w.aft.length < 2 ? `Mới có ${w.aft.length} tuần sau thay đổi ${c.n}.` : c.n === 3 ? 'Cùng lúc nhóm cũng đăng ít bài hơn.' : 'Cùng tuần có thể có thay đổi khác.';
}

/* ---------- Returns ---------- */
function renderRet() {
  const svg = el('curve'), W = Math.round(Math.max(280, svg.getBoundingClientRect().width || 420)), H = 240, L = 34, R = 64, T = 12, B = 26;
  // A cohort shows once its week after has ended; the curves draw the newest four, so the lines stay readable.
  const rows = V.cohorts.filter((c) => c && c.back.length);
  const lines = rows.slice(-4);
  const max = Math.max(10, Math.ceil(Math.max(0, ...rows.flatMap((r) => r.back)) / 10) * 10);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.height = `${H}px`;
  const x = (k) => L + (k - 1) / 5 * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
  let s = '<g class="grid">';
  [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f)).forEach((t) => { s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}%</text>`; });
  for (let k = 1; k <= 6; k++) s += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">+${k} tuần</text>`;
  s += '</g>';
  let newest = -1; lines.forEach((r, idx) => { if (r.back.length > 1) newest = idx; });
  lines.forEach((r, idx) => { const t = lines.length > 1 ? idx / (lines.length - 1) : 1, col = `color-mix(in srgb, #a87b14 ${Math.round(25 + t * 75)}%, #e2d8c4)`;
    const isNew = idx === newest;
    if (r.back.length > 1) s += `<path class="cl${isNew ? ' new' : ''}" style="stroke:${col}" d="${r.back.map((p, k) => `${k ? 'L' : 'M'}${x(k + 1)},${y(p)}`).join(' ')}"/>`;
    r.back.forEach((p, k) => { s += `<circle cx="${x(k + 1)}" cy="${y(p)}" r="${isNew ? 4 : 2.5}" fill="${col}" stroke="var(--raised)" stroke-width="1.5"><title>Nhóm ${r.label} · sau ${k + 1} tuần: ${pct(p)}</title></circle>`; });
    if (isNew) s += `<text class="lbl" x="${x(r.back.length) + 10}" y="${y(r.back.at(-1)) + 4}">nhóm ${r.label}</text>`;
  });
  svg.innerHTML = s;
  const head = `<tr><th class="l">Nhóm</th>${[1, 2, 3, 4, 5, 6].map((k) => `<th>+${k}</th>`).join('')}</tr>`;
  const cell = (v, k) => { if (v == null) return '<td class="none">·</td>';
    const t = Math.min(1, v / max), bg = `color-mix(in srgb, #a87b14 ${Math.round(8 + t * 72)}%, #f6efdf)`;
    return `<td style="background:${bg};color:${t > 0.5 ? '#fbf8f1' : 'var(--ink-2)'}" title="${pct(v)} mở lại app sau ${k} tuần">${Math.round(v)}%</td>`; };
  el('cohort').innerHTML = head + rows.map((r) => `<tr><td class="l">${r.label} <small>· ${r.size}</small></td>${[0, 1, 2, 3, 4, 5].map((k) => cell(r.back[k], k + 1)).join('')}</tr>`).join('');
  el('ret-scale').innerHTML = `0%<i></i>${max}%`;
}

/* ---------- Page ---------- */
function setMode(m) {
  // The page opens on the last finished week; a switch keeps the date that was open.
  const at = V?.groups[cur]?.start ?? (m === 'week' ? addDays(mondayOf(TODAY), -7) : TODAY);
  mode = m; V = build(m); rel = null;
  cur = V.groups.findIndex((g) => at >= g.start && at < g.end);
  if (cur < 0) cur = V.n - 1;
  ROOT.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  renderAll();
}
function renderAll() {
  el('wk-name').textContent = V.groups[cur].name;
  el('wk-prev').disabled = cur <= 0; el('wk-next').disabled = cur === V.n - 1;
  renderHero(); renderFlow(); renderTrend(); renderRet();
}
const go = (d) => { cur += d; renderAll(); };
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ROOT !== document && ROOT.isConnected && V) renderAll(); }, 120); });

const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4a53a"/><stop offset="1" stop-color="#a87b14"/></linearGradient>
  <linearGradient id="ribg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4a53a" stop-opacity=".26"/><stop offset="1" stop-color="#d4a53a" stop-opacity=".08"/></linearGradient>
  <linearGradient id="ribw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b0532f" stop-opacity=".22"/><stop offset="1" stop-color="#b0532f" stop-opacity=".06"/></linearGradient>
  <linearGradient id="colg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c99a2e" stop-opacity=".62"/><stop offset="1" stop-color="#a87b14" stop-opacity=".42"/></linearGradient>
  <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#a87b14" fill-opacity=".14"/><rect width="2.2" height="6" fill="#a87b14" fill-opacity=".55"/></pattern>
  <pattern id="waitp" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#ece4d3"/><rect width="1.5" height="7" fill="#d6ccb9"/></pattern>
  <linearGradient id="areag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a87b14" stop-opacity=".2"/><stop offset="1" stop-color="#a87b14" stop-opacity="0"/></linearGradient>
</defs></svg>`;

const BODY = `<div class="gr">${DEFS}
  <div class="head">
    <h1>Tăng trưởng</h1>
    <div class="ctrls">
      <div class="seg" role="tablist" aria-label="Chọn kỳ"><button type="button" data-mode="week">Tuần</button><button type="button" data-mode="month">Tháng</button><button type="button" data-mode="quarter">Quý</button></div>
      <div class="stepper"><button type="button" id="wk-prev" aria-label="Kỳ trước">‹</button><span id="wk-name" class="num"></span><button type="button" id="wk-next" aria-label="Kỳ sau">›</button></div>
    </div>
  </div>
  <div class="stack">
    <section class="hero" id="hero" aria-label="Số chính của kỳ"></section>
    <section class="card chain">
      <div class="sec-head"><h2 id="chain-title">Chuỗi của tuần</h2><span class="weak-chip" id="weak-chip"></span></div>
      <div class="flow" id="flow"><div class="ftip" id="ftip"></div></div>
      <div class="flow-foot"><span class="k"><i></i> <span id="prev-lbl">mức tuần trước</span></span><span>Cột theo thang log. Vòng tròn là phần trăm đi tiếp. Bấm vòng tròn để xem qua các kỳ.</span><span>Threads không đếm lượt bấm link. Số App Store trễ 2 ngày. Buổi tập đo từ 26/10.</span></div>
    </section>
    <section class="card trend" id="trend-card">
      <div class="sec-head"><h2>Theo thời gian</h2><p>Bấm một ghim để so trước và sau</p></div>
      <div class="chips" id="chips"></div>
      <div class="tr-top"><div class="big num" id="tr-big"></div><div class="sub" id="tr-sub"></div></div>
      <div class="chart-wrap"><svg class="chart" id="trend" role="img" aria-label="Biểu đồ theo kỳ"></svg><div class="tip" id="tip"></div></div>
      <div class="rels" id="rels"></div>
      <p class="tr-note" id="tr-note"></p>
    </section>
    <section class="card ret">
      <div class="sec-head"><h2>Quay lại</h2><p>Phần trăm người mới mở lại app sau 1 đến 6 tuần, theo tuần mở app lần đầu</p></div>
      <div class="ret-grid">
        <svg class="curve" id="curve" role="img" aria-label="Đường quay lại của từng nhóm"></svg>
        <div><div style="overflow-x:auto"><table class="cohort" id="cohort"></table></div>
        <div class="ret-foot"><span>Đường: 4 nhóm mới nhất · nhóm dưới 10 người không hiện</span><span class="scale" id="ret-scale"></span></div></div>
      </div>
    </section>
  </div>
</div>`;

export async function renderGrowth(main) {
  main.innerHTML = BODY;
  ROOT = main;
  TODAY = vnDate();
  const [a, g] = await Promise.all([loadAnalytics(), loadGrowth().catch(() => [])]);
  RAW = { a, g };
  ROOT.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
  el('wk-prev').onclick = () => { if (cur > 0) go(-1); };
  el('wk-next').onclick = () => { if (cur < V.n - 1) go(1); };
  // Studio builds the page before it goes in the document; the charts measure their width, so they wait for it.
  let tries = 0;
  const start = () => { if (!main.isConnected) { if (++tries < 240) requestAnimationFrame(start); return; } V = null; setMode(mode); };
  requestAnimationFrame(start);
}

// The header's three numbers: everyone who opened the app since launch, people who finished a workout this week, and
// the share of the newest finished cohort that opened the app again the week after.
export async function pulseNumbers() {
  const g = await loadGrowth();
  if (!g.length) return null;
  const week = mondayOf(vnDate());
  const val = (metric, start) => +(g.find((r) => r.kind === 'week' && r.metric === metric && r.start === start)?.value ?? 0);
  const sum = (metric) => g.filter((r) => r.kind === 'week' && r.metric === metric).reduce((s, r) => s + +r.value, 0);
  const through = g.filter((r) => r.metric === 'asc_through').map((r) => r.start).sort().at(-1);
  // Downloads from Apple when they exist; before that, everyone who opened the app.
  const opened = through ? sum('dl') : sum('new');
  const cohorts = [...new Set(g.filter((r) => r.kind === 'week' && r.metric === 'back1').map((r) => r.start))].sort()
    .filter((s) => val('size', s) >= 10);
  const last = cohorts.at(-1);
  return { opened, apple: through ? dm(through) : null, trained: val('done', week), back: last ? val('back1', last) / val('size', last) : 0, cohort: last ? dm(last) : '' };
}
