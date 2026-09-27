import { loadAnalytics } from '../data.js';
import { DAY, enrichPosts, summarize, breakdown, weeklySeries, weekOverWeek, indexReadings, lifecycleBand, rankAtAge, themeCounts, logScale, movement, viewsAt, MIN_BAND, MIN_COMPARE, RESULT_DAY } from '../lib/stats.js';
import { mondayOf, vnDate } from '../lib/week.js';
import { LC, lifecycleChart, weekColumns, stripAxis, stripRow, barList, sparkline, meter, heatGrid, shortWeek } from '../lib/charts.js';
import { demoAnalytics } from '../lib/demo.js';
import { ENGINE_LABEL, PULL_LABEL } from '../lib/edits.js';
import { esc, firstLine, toast, icon } from '../ui.js';

const number = (v) => v == null ? 'Chưa có' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(v);
const int = (v) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(v);
const dash = (v) => v == null ? '–' : int(v);
const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`;
const date = (v) => v ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : 'Chưa đọc';
const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
const FIT = { native: 'Đúng ngách', adjacent: 'Gần ngách', reach: 'Mở rộng' };
const PAGE = 8;
const more = (kind, shown, total) => shown < total ? `<p style="margin-top:14px"><button class="btn btn-line sm" data-more="${kind}">Xem thêm · còn ${total - shown}</button></p>` : '';
const SORTS = [['points', 'Điểm'], ['posts', 'Số bài'], ['views', 'Lượt xem'], ['likes', 'Lượt thích'], ['other_replies', 'Trả lời'], ['reposts', 'Đăng lại']];
const MEASURES = [['views', 'Lượt xem'], ['other_replies', 'Trả lời'], ['reposts', 'Đăng lại']];
const MEASURE_LABEL = Object.fromEntries(MEASURES);
// Accounts of one member differ by their last part (…1, …2), so that character marks them.
const mark = (handle) => String(handle).split(/[._]/).filter(Boolean).at(-1)?.charAt(0) ?? '@';
const title = (p) => firstLine(p.version?.op || p.card?.op || 'Bài sáng tạo');
const explain = `<p>Điểm tương tác là trung bình của lượt xem, lượt thích và trả lời của người khác, mỗi số chia cho trung vị ngày 3 của 14 bài trước trên cùng tài khoản. Mỗi tỷ lệ tối đa 5. Mẫu số bằng 0 được tính là 1.</p><p>Tài khoản chưa có bài trước thì bài được so với các bài của cả nhóm ở cùng tuổi. Có dưới 14 bài đủ số liệu thì điểm được ghi là tạm. Mỗi lượt cài có báo cáo theo ct được 3 điểm. Chưa thấy báo cáo thì 0 điểm cài, không có nghĩa là 0 lượt cài thật.</p><p>Điểm cập nhật mỗi ngày. Bài dưới 3 ngày được so với các bài trước của tài khoản ở cùng tuổi, và điểm ghi "đang tăng". Lần đọc đầu tiên từ 72 giờ trở đi là kết quả ngày 3 của bài: từ đó điểm so với kết quả ngày 3 của các bài trước và giữ nguyên, vì sau ngày 3 lượt xem gần như không tăng nữa.</p>`;

export async function renderStats(main, ctx) {
  const data = await loadAnalytics();
  const state = { main, ctx, data, sample: false, lane: 'card', member: '', compare: [], week: '', sort: 'points', measure: 'views', more: { posts: PAGE } };
  paint(state);
}

// The median of the band at an age, read off its day points.
function bandAt(band, age) {
  const d = band.days;
  if (!d.length || age < d[0].day) return null;
  for (let i = 1; i < d.length; i++) {
    if (d[i].day >= age) { const a = d[i - 1], b = d[i]; return a.median + (b.median - a.median) * (age - a.day) / (b.day - a.day); }
  }
  return d.at(-1).median;
}

// Everything the sections need, computed once per paint.
function model(s) {
  const { ctx } = s;
  const data = s.sample ? demoAnalytics(ctx.team) : s.data;
  const now = Date.now();
  const enriched = enrichPosts(data, now);
  const index = indexReadings(data.posts, data.observations);
  const weeks = [...new Set(enriched.map((p) => p.week))].sort().reverse();
  // A slot still holding its setup name (like thaiha.2) is not an account on Threads yet, so it stays off the page.
  const laneAccounts = ctx.team.accounts.filter((a) => a.kind === s.lane && (!s.member || a.member_id === s.member)
    && (!/^[a-z]+\.(1|2|creative)$/.test(a.handle) || enriched.some((p) => p.account_id === a.id)));
  const accounts = laneAccounts.filter((a) => !s.compare.length || s.compare.includes(a.id));
  const allRows = enriched.filter((p) => accounts.some((a) => a.id === p.account_id));
  const rows = allRows.filter((p) => !s.week || p.week === s.week);
  const handle = (id) => ctx.team.accounts.find((a) => a.id === id)?.handle ?? '';
  const total = summarize(rows);
  const weekly = weeklySeries(allRows);
  const wow = weekOverWeek(weekly, s.week || undefined);
  const groups = accounts.map((a) => ({ ...a, ...summarize(rows.filter((p) => p.account_id === a.id)) }))
    .sort((a, b) => (b[s.sort] ?? -1) - (a[s.sort] ?? -1) || a.handle.localeCompare(b.handle));
  const ofMember = (m) => (p) => accounts.some((a) => a.id === p.account_id && a.member_id === m.id);
  const memberGroups = ctx.team.members.filter((m) => accounts.some((a) => a.member_id === m.id))
    .map((m) => ({ ...m, ...summarize(rows.filter(ofMember(m))) })).sort((a, b) => b.points - a.points);
  const prevWeek = s.week ? weeks[weeks.indexOf(s.week) + 1] ?? null : null;
  const prevRows = prevWeek ? allRows.filter((p) => p.week === prevWeek) : [];
  const prevRank = (list, keyFn) => list.map((x) => ({ id: x.id, points: summarize(prevRows.filter(keyFn(x))).points })).sort((a, b) => b.points - a.points).map((x) => x.id);
  const byPoints = [...groups].sort((a, b) => b.points - a.points);
  const memberMove = prevWeek ? movement(memberGroups.map((m) => m.id), prevRank(memberGroups, ofMember)) : null;
  const accountMove = prevWeek ? movement(byPoints.map((a) => a.id), prevRank(groups, (a) => (p) => p.account_id === a.id)) : null;
  const latestRun = [...data.runs].sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))[0];
  const readLine = s.sample ? 'Đang xem số liệu mẫu'
    : latestRun ? `Lần đọc gần nhất ${date(latestRun.finished_at)}${latestRun.status !== 'complete' ? ' · chưa đọc đủ tài khoản' : ''}` : 'Chưa có lần đọc Threads';
  const keywords = new Map();
  for (const k of data.keywords) { if (!keywords.has(k.card_id)) keywords.set(k.card_id, []); keywords.get(k.card_id).push(k.keyword); }
  const laneRows = enriched.filter((p) => (!s.week || p.week === s.week) && ctx.team.accounts.some((a) => a.id === p.account_id && (!s.member || a.member_id === s.member)));
  const scale = logScale(rows.flatMap((p) => [p.d3?.views, p.latest?.views]));
  const band = lifecycleBand(rows, index);
  const slotOf = (id) => s.compare.length >= 2 ? s.compare.indexOf(id) + 1 : null;
  const latestOf = new Map();
  for (const p of rows) { const c = latestOf.get(p.account_id); if (!c || Date.parse(p.published_at) > Date.parse(c.published_at)) latestOf.set(p.account_id, p); }
  // Mature posts first so the young ones draw on top.
  const series = [...rows].sort((a, b) => (a.age < RESULT_DAY) - (b.age < RESULT_DAY) || Date.parse(a.published_at) - Date.parse(b.published_at)).map((p) => {
    const slot = slotOf(p.account_id);
    return { id: p.id, label: `${title(p)} · @${handle(p.account_id)}`, points: (index.get(p.id) ?? []).map((o) => ({ age: o.age, views: o.views })), young: p.age < RESULT_DAY,
      slot: slot ?? undefined, endLabel: slot && latestOf.get(p.account_id) === p ? `@${handle(p.account_id)}` : undefined };
  });
  const newest = [...rows].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  // The lifecycle chart keeps its text at reading size: the viewBox follows the panel width instead of scaling down.
  const gutter = Math.min(40, Math.max(16, window.innerWidth * 0.04)), pad = Math.min(26, Math.max(18, window.innerWidth * 0.03));
  const lcWidth = Math.max(300, Math.min(LC.width, s.main.clientWidth - 2 * gutter - 2 * pad - 2));
  const lcHeight = lcWidth < 480 ? 250 : LC.height;
  return { s, ctx, data, now, enriched, index, weeks, laneAccounts, accounts, allRows, rows, newest, handle, total, weekly, wow, groups, byPoints, memberGroups, memberMove, accountMove, prevWeek, readLine, keywords, laneRows, scale, band, series, lcWidth, lcHeight };
}

function head({ s, ctx, weeks, laneAccounts, readLine, rows }) {
  return `<div class="page-head"><div><p class="eyebrow">Số liệu</p><h1 class="page-title">Kết quả ngày 3</h1>
      <p class="sub">${esc(readLine)}. Trả lời chỉ tính người khác.</p></div>
      ${rows.length || s.sample ? `<button class="btn ${s.sample ? 'btn-ink' : 'btn-line'} sm" data-sample>${s.sample ? 'Về số liệu thật' : `${icon('eye')}Số liệu mẫu`}</button>` : ''}</div>
    ${s.sample ? `<p class="notice" role="status">${icon('info')}<span>Đang xem số liệu mẫu. Các con số được tạo để thử giao diện, không phải kết quả Threads hay lượt cài thật.</span></p>` : ''}
    <div class="toolbar"><div class="seg" role="group" aria-label="Loại tài khoản"><button type="button" data-lane="card" aria-pressed="${s.lane === 'card'}">Bài có sẵn</button><button type="button" data-lane="creative" aria-pressed="${s.lane === 'creative'}">Bài sáng tạo</button></div>
      <label style="display:contents"><span class="sr-only">Thành viên</span><select id="member">${option('', 'Cả nhóm', s.member)}${ctx.team.members.map((m) => option(m.id, m.name, s.member)).join('')}</select></label>
      <label style="display:contents"><span class="sr-only">Tuần đăng bài</span><select id="week">${option('', 'Mọi tuần', s.week)}${weeks.map((w) => option(w, `Tuần ${shortWeek(w)}`, s.week)).join('')}</select></label></div>
    ${laneAccounts.length > 1 ? `<details class="flag" style="margin:0 0 16px;border:0"${s.compare.length ? ' open' : ''}><summary>${icon('stats')}So sánh tài khoản${s.compare.length ? ` · đã chọn ${s.compare.length}` : ' · tối đa 3'}</summary>
      <div class="chips" style="padding-bottom:6px">${laneAccounts.map((a) => `<button data-compare="${esc(a.id)}" aria-pressed="${s.compare.includes(a.id)}">@${esc(a.handle)}</button>`).join('')}</div></details>` : ''}`;
}

function emptyStage({ s }) {
  return `<section class="stage empty-stage"><p class="eyebrow">Chưa có bài trong lựa chọn này</p>
      <h2>Số liệu hiện ở đây sau lần đọc Threads đầu tiên.</h2>
      <p class="muted">Sao chép bài ở Hôm nay rồi đăng trên Threads. Lần đọc hằng ngày trên máy Nam ghi nhận bài và số liệu.</p>
      <div class="actions"><a class="btn btn-gold" href="#/">Mở Hôm nay${icon('right')}</a>${s.sample ? '' : `<button class="btn btn-ghost" data-sample>${icon('eye')}Xem số liệu mẫu</button>`}</div></section>`;
}

// Three medians, each with the previous week beneath it, and the weekly columns beside.
function hero({ s, total, wow, weekly }) {
  const kpi = (key, label) => {
    const d = wow.delta?.[key], cur = wow.current, prev = wow.previous;
    let sub;
    if (!cur) sub = 'chưa có bài đủ ngày 3';
    else if (s.week) sub = !prev ? 'chưa có tuần trước để so' : !wow.delta ? `cần ${MIN_COMPARE} bài đủ ngày 3 mỗi tuần để so` : d == null ? `tuần trước ${dash(prev[key])}` : `${pct(d)} so với tuần trước (${dash(prev[key])})`;
    else sub = `tuần ${shortWeek(cur.week)}: ${dash(cur[key])}${d != null ? `, ${pct(d)} so với tuần trước` : ''}`;
    return `<div class="kpi"><div class="big${total.now[key] == null ? ' na' : ''}">${total.now[key] == null ? '–' : int(total.now[key])}</div><p class="lbl">${label}</p><p class="delta${d > 0 ? ' up' : d < 0 ? ' down' : ''}">${esc(sub)}</p></div>`;
  };
  const shown = weekly.slice(-10);
  return `<section class="stage hero-stats"><div><p class="eyebrow">Trung vị hiện tại · ${total.read} bài · ${s.week ? `tuần ${shortWeek(s.week)}` : 'mọi tuần'}</p>
      <div class="kpis">${kpi('views', 'Lượt xem')}${kpi('other_replies', 'Trả lời của người khác')}${kpi('reposts', 'Đăng lại')}</div>
      <p class="summary-foot"><span>${total.n} bài đủ ngày 3, ${total.read - total.n} bài đang tăng dùng số mới nhất / ${total.posts} bài đã đăng. Số chưa đọc không tính thành 0.</span><span>${total.installs} lượt cài được báo cáo</span></p></div>
    ${shown.length ? `<figure class="hero-weeks"><figcaption>Trung vị lượt xem theo tuần<span>${shown.length} tuần · cột rỗng: chưa có bài đủ ngày 3</span></figcaption>${weekColumns({ weeks: shown, key: 'views', highlight: s.week || wow.current?.week, format: int })}</figure>` : ''}</section>`;
}

// Every post's view curve over the band of usual posts: is the young one on track?
function lifecycle({ s, rows, index, band, scale, handle, series, lcWidth, lcHeight }) {
  const young = rows.filter((p) => p.age < RESULT_DAY && p.latest);
  const ahead = young.filter((p) => { const last = (index.get(p.id) ?? []).at(-1); const m = last ? bandAt(band, last.age) : null; return m != null && last.views > m; }).length;
  const take = band.days.length
    ? `<b>${young.length} bài đang tăng</b>${young.length ? `, ${ahead} bài đang ở trên đường trung vị ở cùng tuổi` : ''}. Vùng xám là nửa giữa của ${band.n} bài đã đủ ngày 3 trong lựa chọn này.`
    : `<b>${young.length} bài đang tăng</b>. Cần ít nhất ${MIN_BAND} bài đủ ngày 3 để vẽ đường trung vị và vùng thường gặp.`;
  const legend = s.compare.length >= 2
    ? s.compare.map((id, i) => `<span style="--key:var(--s${i + 1})"><i class="thick"></i>@${esc(handle(id))}</span>`).join('')
    : `<span style="--key:var(--s1)"><i class="thick"></i>Đang tăng, dưới 3 ngày</span><span style="--key:var(--recede)"><i></i>Đã đủ 3 ngày</span>`;
  const table = [...rows].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).map((p) => `<tr><th scope="row">${esc(title(p))} <span class="muted">@${esc(handle(p.account_id))}</span></th><td>${p.age < RESULT_DAY ? `ngày ${Math.floor(p.age)}` : 'đủ 3'}</td><td>${dash(p.latest?.views)}</td><td>${dash(p.d3?.views)}</td></tr>`).join('');
  return `<section class="section"><div class="section-head"><div><p class="eyebrow">Đường đời</p><h2 class="section-title">Mỗi bài lớn lên thế nào?</h2>
      <p class="sub">Trục ngang là số ngày sau khi đăng, trục đứng là lượt xem trên thang log. Chạm hoặc rê vào một đường để đọc bài đó, bấm để mở chi tiết.</p></div></div>
    <figure class="panel lc-fig"><p class="take">${take}</p>${lifecycleChart({ series, band, scale, width: lcWidth, height: lcHeight, format: int })}
      <div class="legend">${legend}${band.days.length ? `<span style="--key:var(--ink)"><i class="thick"></i>Trung vị</span><span><i class="wash"></i>Nửa giữa (25–75%)</span>` : ''}</div>
      <div class="tip" hidden></div>
      <details class="lc-table"><summary>Xem dạng bảng</summary><table class="compact"><thead><tr><th>Bài</th><th style="text-align:right">Tuổi</th><th style="text-align:right">Xem mới nhất</th><th style="text-align:right">Ngày 3</th></tr></thead><tbody>${table}</tbody></table></details></figure></section>`;
}

// One strip of dots per account on a shared log axis, the medians and points beside.
function accountsTable({ s, groups, rows, scale }) {
  const axis = stripAxis({ scale, format: int });
  const row = (g) => {
    const mine = rows.filter((p) => p.account_id === g.id);
    const values = mine.map((p) => ({ id: p.id, views: p.d3 ? p.d3.views : p.latest?.views, young: !p.d3,
      title: `${title(p)} · ${p.d3 ? `ngày 3: ${dash(p.d3.views)}` : `đang tăng: ${dash(p.latest?.views)}`} lượt xem` })).filter((x) => x.views != null);
    return `<div class="strip-row${mine.length ? '' : ' is-empty'}"><div class="strip-who"><i class="av sm light">${esc(mark(g.handle))}</i><span><b>@${esc(g.handle)}</b><small>${mine.length ? `${g.n} bài đủ ngày 3 / ${g.posts} · đọc ${esc(date(g.lastRead))}` : 'Chưa có bài trong lựa chọn này'}</small></span></div>
      ${stripRow({ values, median: g.now.views, scale, label: `Lượt xem từng bài của @${g.handle}`, format: int })}
      <dl class="strip-nums"><div><dt>Xem</dt><dd>${dash(g.now.views)}</dd></div><div><dt>Thích</dt><dd>${dash(g.now.likes)}</dd></div><div><dt>Trả lời</dt><dd>${dash(g.now.other_replies)}</dd></div><div><dt>Đăng lại</dt><dd>${dash(g.now.reposts)}</dd></div><div class="pts"><dt>Điểm</dt><dd>${g.points ? number(g.points) : '0'}${g.provisional ? '<small>tạm</small>' : ''}</dd></div></dl></div>`;
  };
  return `<section class="section"><div class="section-head"><div><p class="eyebrow">Tài khoản</p><h2 class="section-title">Từng tài khoản</h2>
      <p class="sub">Mỗi chấm là một bài, đặt theo lượt xem ngày 3 trên thang log; chấm rỗng là bài đang tăng với số mới nhất. Vạch đậm là trung vị của tài khoản.</p></div>
      <label><span class="sr-only">Sắp xếp theo</span><select id="sort">${SORTS.map(([v, l]) => option(v, `Sắp xếp: ${l}`, s.sort)).join('')}</select></label></div>
    <div class="strip-table"><div class="strip-head"><span>Tài khoản</span>${axis}<span>Trung vị hiện tại</span></div><div class="strip-axis-m">${axis}</div>${groups.map(row).join('')}</div></section>`;
}

// One row per account, one cell per day of the last four weeks, shaded by that post's score.
function rhythm({ accounts, allRows, now, lcWidth }) {
  // A phone gets two weeks so a cell stays readable; the cells are a picture there, not tap targets.
  const count = lcWidth < 480 ? 14 : 28;
  const days = Array.from({ length: count }, (_, i) => vnDate(new Date(now - (count - 1 - i) * DAY)));
  const marks = days.map((d, i) => mondayOf(d) === d ? { i, text: shortWeek(d) } : null).filter(Boolean);
  const rows = accounts.map((a) => {
    const cells = {};
    for (const p of allRows.filter((p) => p.account_id === a.id)) {
      const day = vnDate(new Date(p.published_at));
      if (!cells[day] || (p.latest?.views ?? 0) > (cells[day].views ?? 0)) cells[day] = { id: p.id, score: p.scoring.score, young: p.age < RESULT_DAY, views: p.latest?.views ?? null };
    }
    return { id: a.id, label: `@${a.handle}`, cells };
  });
  return `<section class="section"><div class="section-head"><div><p class="eyebrow">Nhịp đăng</p><h2 class="section-title">${count} ngày qua</h2>
      <p class="sub">Một ô một ngày. Màu đậm dần theo điểm tương tác của bài hôm đó so với bài thường của chính tài khoản; ô viền là bài đang tăng, ô trống là ngày không đăng.${count === 28 ? ' Bấm một ô để mở bài.' : ''}</p></div></div>
    <div class="panel">${heatGrid({ days, rows, marks, format: int })}
      <div class="legend"><span><i class="sq none"></i>Không đăng</span><span><i class="sq hollow"></i>Đang tăng</span><span style="--key:#efdfae"><i class="sq"></i>dưới 0,5</span><span style="--key:#e5b33a"><i class="sq"></i>0,5–1</span><span style="--key:#b8861a"><i class="sq"></i>1–2</span><span style="--key:#7f5e10"><i class="sq"></i>trên 2</span><span style="--key:var(--sand-2)"><i class="sq"></i>Chưa có điểm</span></div></div></section>`;
}

// Points per member and per account, split into engagement and installs, with the rank change beside.
function boards({ s, total, memberGroups, byPoints, memberMove, accountMove, prevWeek }) {
  const mv = (map, id) => {
    if (!map) return '';
    const d = map.get(id);
    return `<span class="mv${d > 0 ? ' up' : d < 0 ? ' down' : ''}">${d == null ? 'mới' : d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '='}</span>`;
  };
  const board = (h, items, map) => {
    const max = Math.max(1, ...items.map((i) => i.points));
    return `<div class="panel board"><h3>${h}</h3><ol>${items.map((it, i) => `<li><span class="r">${i + 1}</span><span class="nm"><span>${esc(it.label)}</span>
      <span class="bar"><i style="width:${(it.engagement / max) * 100}%"></i><i class="inst" style="width:${(it.installs * 3 / max) * 100}%"></i></span></span>${mv(map, it.id)}<b>${number(it.points)}</b></li>`).join('')}</ol></div>`;
  };
  const items = (list) => list.map((g) => ({ id: g.id, label: g.name ?? `@${g.handle}`, points: g.points, engagement: g.engagement, installs: g.installs, provisional: g.provisional }));
  const noPoints = total.scored === 0 && total.installs === 0;
  return `<section class="section"><div class="section-head"><div><p class="eyebrow">Xếp hạng</p><h2 class="section-title">${s.week ? `Tuần ${esc(shortWeek(s.week))}` : 'Mọi tuần'}</h2>
      <p class="sub">${total.scored} bài có điểm tương tác${total.provisional ? `, ${total.provisional} bài điểm tạm` : ''}. ${total.installs} lượt cài được báo cáo.${prevWeek ? ` Mũi tên là thay đổi thứ hạng so với tuần ${shortWeek(prevWeek)}.` : ''}</p></div></div>
    <div class="team-total"><b>${number(total.points)}</b><span>điểm cả lựa chọn</span><span>${number(total.engagement)} điểm tương tác</span><span>${int(total.installs * 3)} điểm cài</span></div>
    ${noPoints ? '<p class="board-note">Chưa có bài đủ ngày 3 và chưa có lượt cài được báo cáo, nên chưa có điểm. Bảng xếp hạng có sau lần đọc ngày 3 đầu tiên.</p>' : ''}
    <div class="legend" style="margin:0 0 12px"><span style="--key:var(--ink)"><i class="sq"></i>Điểm tương tác</span><span style="--key:var(--gold)"><i class="sq"></i>Điểm cài, 3 mỗi lượt</span></div>
    <div class="boards">${board('Thành viên', items(memberGroups), memberMove)}${board('Tài khoản', items(byPoints), accountMove)}</div>
    <div class="folds"><details class="fold"><summary>Cách tính điểm<span class="plus"></span></summary><div class="fold-body explain">${explain}</div></details></div></section>`;
}

// Sorted bars per card attribute, the post count on every bar, thin groups hatched.
function learning({ s, rows, laneRows, ctx, keywords, handle }) {
  const m = s.measure, label = MEASURE_LABEL[m].toLowerCase();
  const toRows = (groups) => groups.map((g) => ({ label: g.label, n: g.n, value: g[m] })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.n - a.n);
  const panel = (h, groups, note = '') => `<div class="panel bl-panel"><h3>${h}</h3><p class="tiny muted">Trung vị ${label} ngày 3 · nhóm dưới 3 bài gạch chéo, chưa đáng tin${note}</p>${groups.length ? barList({ rows: toRows(groups), format: int }) : '<p class="small muted">Chưa có bài đủ ngày 3 trong nhóm này.</p>'}</div>`;
  const lane = ['card', 'creative'].map((kind) => ({ label: kind === 'card' ? 'Bài có sẵn' : 'Bài sáng tạo', ...summarize(laneRows.filter((p) => ctx.team.accounts.some((a) => a.id === p.account_id && a.kind === kind))) }));
  const panels = [panel('Bài có sẵn và bài sáng tạo', lane.filter((g) => g.posts), ' · cùng thành viên, cùng tuần')];
  let perAccount = '';
  if (s.lane === 'card') {
    const kw = breakdown(rows, (p) => keywords.get(p.card_id) ?? ['Chưa có từ khóa nguồn']).sort((a, b) => b.n - a.n).slice(0, 8);
    panels.push(panel('Theo dự đoán sức hút', breakdown(rows, (p) => PULL_LABEL[p.card?.pull]?.replace(/^Dự đoán: /, ''))), panel('Theo cách kéo bình luận', breakdown(rows, (p) => ENGINE_LABEL[p.card?.engine])),
      panel('Theo độ khớp ngách', breakdown(rows, (p) => FIT[p.card?.fit])), panel('Theo nhóm từ khóa', kw, ' · 8 nhóm nhiều bài nhất'),
      panel('Bài có sửa và giữ nguyên', breakdown(rows, (p) => p.version ? p.version.changed_parts?.length ? 'Có sửa' : 'Giữ nguyên' : 'Chưa đọc nội dung')));
    const byAccount = breakdown(rows, (p) => `@${handle(p.account_id)} · ${p.version ? p.version.changed_parts?.length ? 'có sửa' : 'giữ nguyên' : 'chưa đọc nội dung'}`);
    if (byAccount.length) perAccount = `<details class="fold"><summary>Có sửa và giữ nguyên trong từng tài khoản<span class="plus"></span></summary><div class="fold-body"><table class="compact"><thead><tr><th>Nhóm</th><th style="text-align:right">Số bài</th><th style="text-align:right">Trung vị ${label}</th></tr></thead><tbody>${byAccount.map((g) => `<tr><th scope="row">${esc(g.label)}</th><td>${g.n}</td><td>${dash(g[m])}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  return `<section class="section"><div class="section-head"><div><p class="eyebrow">So sánh</p><h2 class="section-title">Bài nào đang hiệu quả?</h2>
      <p class="sub">So trung vị ngày 3, luôn kèm số bài. Đây là mô tả mẫu đã đọc, chưa đủ để kết luận nguyên nhân.</p></div>
      <div class="seg" role="group" aria-label="Đo bằng">${MEASURES.map(([v, l]) => `<button type="button" data-measure="${v}" aria-pressed="${m === v}">${l}</button>`).join('')}</div></div>
    <div class="learn-grid">${panels.join('')}</div>${perAccount}</section>`;
}

// Themes merged across posts; the bar is how many posts drew that theme.
function themes({ rows, handle }) {
  const list = themeCounts(rows).slice(0, 8);
  const byId = new Map(rows.map((p) => [p.id, p]));
  const max = list[0]?.posts ?? 0;
  const read = rows.filter((p) => p.latest?.reply_themes?.length).length;
  return `<section class="section"><div class="section-head"><div><p class="eyebrow">Bình luận</p><h2 class="section-title">Người đọc đang nói gì?</h2>
      <p class="sub">Nhận định của máy từ mẫu bình luận từng bài, gộp theo chủ đề trùng nhau${read ? ` · ${read} bài có mẫu` : ''}. Không coi mẫu là toàn bộ người đọc.</p></div></div>
    ${list.length ? `<div class="panel theme-list" style="padding-top:4px;padding-bottom:4px">${list.map((t) => `<details class="theme"><summary><span><span>${esc(t.theme)}</span>${max >= 2 ? `<span class="tb"><i style="--w:${Math.round(t.posts / max * 100)}%"></i></span>` : ''}</span><b>${t.posts} bài</b></summary>
      <ul>${t.ids.map((id) => byId.get(id)).filter(Boolean).map((p) => `<li>@${esc(handle(p.account_id))} · ${date(p.published_at)} · <q>${esc(title(p))}</q></li>`).join('')}</ul></details>`).join('')}</div>` : '<p class="small muted">Chưa có mẫu đọc bình luận.</p>'}</section>`;
}

function postRow(p, { ctx, data, s, index, enriched }) {
  const account = ctx.team.accounts.find((a) => a.id === p.account_id);
  const readings = index.get(p.id) ?? [];
  const young = p.age < RESULT_DAY;
  const status = young ? `Đang tăng · ngày ${Math.floor(p.age)}` : p.d3 ? 'Đã có lần đọc ngày 3' : 'Thiếu lần đọc ngày 3';
  const current = p.latest;
  const themeList = current?.reply_themes ?? [];
  const versions = data.versions.filter((v) => v.post_id === p.id).sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
  const metric = (label, v) => `<div><dt>${label}</dt><dd>${v == null ? '–' : int(v)}</dd></div>`;
  const rank = young ? rankAtAge(p, enriched, index) : null;
  const b = p.scoring.baseline;
  const ratio = (k) => p.scoring.reading[k] / Math.max(1, b[k]);
  const ratios = b && p.scoring.reading ? `<div class="ratios">${[['views', 'Xem'], ['likes', 'Thích'], ['other_replies', 'Trả lời']].map(([k, l]) => `<div><span class="k">${l}</span>${meter({ ratio: ratio(k) })}<span class="v">×${number(Math.min(5, ratio(k)))}</span></div>`).join('')}</div>
      <p class="ratios-note">Vạch đen là bài thường của tài khoản (×1), thanh chạy tới ×5. Điểm tương tác <b style="font-weight:500">${number(p.scoring.score)}</b> là trung bình ba tỷ lệ, so với ${p.scoring.team ? `${p.scoring.n} bài của cả nhóm, vì tài khoản chưa có bài trước` : `${p.scoring.n} bài trước`}${p.scoring.growing ? ` ở cùng tuổi (ngày ${Math.floor(p.age)}), đang tăng, chốt ở ngày 3` : ''}${p.scoring.n < 14 ? ', điểm tạm' : ''}.</p>`
    : `<p class="small muted" style="margin-top:10px">${young ? 'Chưa có bài trước của tài khoản ở cùng tuổi để so, nên chưa có điểm tương tác.' : p.d3 ? 'Chưa có lịch sử ngày 3 của tài khoản để so, nên chưa có điểm tương tác.' : 'Thiếu lần đọc ngày 3 nên bài này không có điểm.'}</p>`;
  return `<details class="fold${young ? '' : ' is-mature'}" data-post="${esc(p.id)}"><summary><span class="post-sum"><span class="t">${esc(title(p))}</span>
      <span class="m">@${esc(account?.handle)} · ${esc(status)} · ${dash(current?.views)} xem</span>${sparkline({ points: readings.map((o) => ({ age: o.age, views: o.views })) })}</span><span class="plus"></span></summary>
    <div class="fold-body">
    <p class="small muted">Đăng ${date(p.published_at)} · Đọc ${date(current?.captured_at)} · ${p.match_method === 'text' ? 'Ghép bằng nội dung, chưa thấy ct' : p.match_method === 'ct' ? 'Ghép bằng ct' : 'Bài sáng tạo'}</p>
    ${rank ? `<p style="margin:10px 0 0"><span class="chip">Đang xếp ${rank.rank}/${rank.of} so với các bài trước của tài khoản ở cùng tuổi</span></p>` : ''}
    <dl class="metrics">${metric('Xem', current?.views)}${metric('Thích', current?.likes)}${metric('Trả lời người khác', current?.other_replies)}${metric('Đăng lại', current?.reposts)}${metric('Trích dẫn', current?.quotes)}</dl>
    ${ratios}
    <p class="small">Lượt cài ${p.installs == null ? 'chưa có báo cáo' : number(p.installs)} · ${number(p.installPoints)} điểm cài · tổng ${number(p.points)} điểm.</p>
    ${!s.sample && /^https:\/\/(www\.)?threads\.(net|com)\//.test(p.source_url ?? '') ? `<p><a class="linkish" href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">Mở bài đã đăng${icon('out')}</a></p>` : ''}
    ${themeList.length ? `<p class="eyebrow" style="margin:16px 0 4px">Bình luận · máy đọc ${current.reply_sample_size} bình luận · ${esc(current.model)}</p><ul class="themes">${themeList.map((t) => `<li>${esc(t.theme)}${t.count != null ? ` <span class="tiny muted">· ${int(t.count)} trong mẫu</span>` : ''}</li>`).join('')}</ul>` : '<p class="small muted" style="margin-top:10px">Chưa có mẫu đọc bình luận.</p>'}
    ${versions.length ? `<details class="alt" style="margin:12px 0 0"><summary>Nội dung đã đăng và các lần sửa<span class="plus"></span></summary>${versions.map((v) => `<section class="version"><p class="tiny muted">Đọc ${date(v.captured_at)}</p>${['op', 'r1', 'r2'].map((part) => v[part] == null ? '' : `<h4>${{ op: 'Bài đăng', r1: 'Bình luận 1', r2: 'Bình luận 2' }[part]}</h4><p class="plain">${esc(v[part])}</p>${v.changed_parts?.includes(part) ? `<p class="tiny muted" style="margin-top:8px">Bản viết sẵn</p><p class="quote" style="font-size:15px">${esc(v.writer_text?.[part] ?? 'Chưa có')}</p><p class="tiny muted" style="margin-top:8px">Lần sao chép gần nhất trước khi đăng</p><p class="quote" style="font-size:15px">${esc(v.copied_text?.[part] ?? 'Chưa ghi nhận sao chép')}</p>` : ''}`).join('')}</section>`).join('')}</details>` : ''}
    <details class="alt" style="margin:0"><summary>Lịch sử số liệu<span class="plus"></span></summary><ul class="readings">${readings.map((o) => `<li>${date(o.captured_at)} · ngày ${o.age.toFixed(1)} · ${dash(o.views)} xem · ${dash(o.likes)} thích · ${dash(o.other_replies)} trả lời của người khác</li>`).join('')}</ul></details>
  </div></details>`;
}

function posts(v) {
  const { s, rows, newest } = v;
  return `<section class="section posts-list"><div class="section-head"><div><p class="eyebrow">Chi tiết</p><h2 class="section-title">Từng bài</h2>
      <p class="sub">Đường nhỏ là lượt xem của chính bài đó theo ngày. Mở một bài để xem tỷ lệ so với bài thường của tài khoản.</p></div><span class="count">${rows.length} bài</span></div>
    ${newest.slice(0, s.more.posts).map((p) => postRow(p, v)).join('')}${more('posts', s.more.posts, newest.length)}</section>`;
}

const repaint = (s) => { const y = window.scrollY; paint(s); window.scrollTo(0, y); };

function paint(s) {
  const v = model(s);
  s.main.innerHTML = head(v) + (v.rows.length ? [hero(v), lifecycle(v), accountsTable(v), rhythm(v), boards(v), learning(v), themes(v), posts(v)].join('') : emptyStage(v));
  wire(v);
}

// Hover and touch on the lifecycle chart: the nearest curve at that age lights up, the rest recede.
function wireLifecycle({ s, series, scale }, open) {
  const fig = s.main.querySelector('.lc-fig'), svg = fig?.querySelector('svg.lc');
  if (!svg) return;
  const tip = fig.querySelector('.tip');
  const marks = [...svg.querySelectorAll('.lc-post')];
  const byId = new Map(series.map((x) => [x.id, x]));
  let hot = null;
  const { width: W, height: H } = svg.viewBox.baseVal;
  const locate = (e) => {
    const rect = svg.getBoundingClientRect(), k = rect.width / W;
    const px = (e.clientX - rect.left) / k, py = (e.clientY - rect.top) / k;
    const age = (px - LC.L) / (W - LC.L - LC.R) * LC.xMax;
    if (age < 0 || age > LC.xMax) return null;
    let best = null, bestD = 30;
    for (const g of marks) {
      const sr = byId.get(g.dataset.id);
      if (!sr || !sr.points.length || age < sr.points[0].age) continue;
      const value = viewsAt(sr.points, age);
      if (value == null || value <= 0) continue;
      const d = Math.abs(LC.T + (1 - scale.pos(value)) * (H - LC.T - LC.B) - py);
      if (d < bestD) { bestD = d; best = { g, sr, value, age }; }
    }
    return best;
  };
  const show = (hit, e) => {
    marks.forEach((g) => { g.classList.toggle('is-hot', g === hit?.g); g.classList.toggle('is-dim', !!hit && g !== hit.g); });
    if (!hit) { tip.hidden = true; return; }
    const b = document.createElement('b');
    b.textContent = `${int(Math.round(hit.value))} lượt xem · ngày ${hit.age.toFixed(1)}`;
    const span = document.createElement('span');
    span.textContent = hit.sr.label;
    tip.replaceChildren(b, span);
    const fr = fig.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(e.clientX - fr.left, 90), fr.width - 90)}px`;
    tip.style.top = `${e.clientY - fr.top}px`;
    tip.hidden = false;
  };
  svg.addEventListener('pointermove', (e) => { hot = locate(e); show(hot, e); });
  svg.addEventListener('pointerdown', (e) => { hot = locate(e); show(hot, e); });
  svg.addEventListener('pointerleave', () => { hot = null; show(null); });
  svg.addEventListener('click', () => { if (hot) open(hot.sr.id); });
}

function wire(v) {
  const { s, newest } = v, { main } = s;
  const open = (id) => {
    const at = newest.findIndex((p) => p.id === id);
    if (at < 0) return;
    if (at >= s.more.posts) { s.more.posts = Math.ceil((at + 1) / PAGE) * PAGE; repaint(s); }
    const d = main.querySelector(`details[data-post="${CSS.escape(id)}"]`);
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  main.querySelectorAll('[data-more]').forEach((b) => { b.onclick = () => { s.more[b.dataset.more] += PAGE * 3; repaint(s); }; });
  main.querySelectorAll('[data-sample]').forEach((b) => { b.onclick = () => { s.sample = !s.sample; s.week = ''; repaint(s); }; });
  main.querySelectorAll('[data-lane]').forEach((b) => { b.onclick = () => { s.lane = b.dataset.lane; s.compare = []; repaint(s); }; });
  main.querySelectorAll('[data-measure]').forEach((b) => { b.onclick = () => { s.measure = b.dataset.measure; repaint(s); }; });
  main.querySelector('#member').onchange = (e) => { s.member = e.target.value; s.compare = []; repaint(s); };
  main.querySelector('#week').onchange = (e) => { s.week = e.target.value; repaint(s); };
  main.querySelector('#sort')?.addEventListener('change', (e) => { s.sort = e.target.value; repaint(s); });
  main.querySelectorAll('[data-compare]').forEach((b) => { b.onclick = () => {
    const id = b.dataset.compare;
    if (s.compare.includes(id)) s.compare = s.compare.filter((x) => x !== id);
    else if (s.compare.length < 3) s.compare.push(id);
    else { toast('Chọn tối đa 3 tài khoản để so sánh.'); return; }
    repaint(s);
  }; });
  main.querySelectorAll('.sp-dot[data-id],.hg-cell[data-id]').forEach((el) => {
    el.addEventListener('click', () => open(el.dataset.id));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.dataset.id); } });
  });
  wireLifecycle(v, open);
}
