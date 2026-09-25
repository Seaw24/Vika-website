import { loadAnalytics } from '../data.js';
import { enrichPosts, summarize, breakdown } from '../lib/stats.js';
import { demoAnalytics } from '../lib/demo.js';
import { ENGINE_LABEL, PULL_LABEL } from '../lib/edits.js';
import { esc, firstLine, toast, icon } from '../ui.js';

const number = (v) => v == null ? 'Chưa có' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(v);
const date = (v) => v ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : 'Chưa đọc';
const dayLabel = (v) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(new Date(v));
const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
const FIT = { native: 'Đúng ngách', adjacent: 'Gần ngách', reach: 'Mở rộng' };
const COLORS = ['#1f1812', '#c8961f', '#2e6e63'];
const PAGE = 8;
const more = (kind, shown, total) => shown < total ? `<p style="margin-top:14px"><button class="btn btn-line sm" data-more="${kind}">Xem thêm · còn ${total - shown}</button></p>` : '';
const SORTS = [['points', 'Điểm'], ['posts', 'Số bài'], ['views', 'Lượt xem'], ['likes', 'Lượt thích'], ['other_replies', 'Trả lời'], ['reposts', 'Đăng lại']];

export async function renderStats(main, ctx) {
  const data = await loadAnalytics();
  const state = { main, ctx, data, sample: false, lane: 'card', member: '', compare: [], week: '', sort: 'points', more: { posts: PAGE, themes: PAGE } };
  paint(state);
}

const big = (v, label) => `<div><div class="big${v == null ? ' na' : ''}">${v == null ? '–' : number(v)}</div><p class="lbl">${esc(label)}</p></div>`;

function accountCards(groups) {
  return `<div class="acc-grid">${groups.map((g) => `<article class="panel acc">
    <div class="acc-head"><span class="handle"><i class="av sm light">${esc(g.handle.split('.').at(-1).charAt(0))}</i><span>@${esc(g.handle)}</span></span>
      <span class="acc-pts"><b>${g.points ? number(g.points) : '0'}</b><small>điểm${g.provisional ? ' · tạm' : ''}</small></span></div>
    <dl><div><dt>Xem</dt><dd>${g.views == null ? '–' : number(g.views)}</dd></div><div><dt>Thích</dt><dd>${g.likes == null ? '–' : number(g.likes)}</dd></div>
      <div><dt>Trả lời</dt><dd>${g.other_replies == null ? '–' : number(g.other_replies)}</dd></div><div><dt>Đăng lại</dt><dd>${g.reposts == null ? '–' : number(g.reposts)}</dd></div></dl>
    <p class="foot"><span>${g.posts} bài · ${g.n} có ngày 7</span><span>Đọc ${esc(date(g.lastRead))}</span></p></article>`).join('')}</div>`;
}

function groupTable(groups, title) {
  return `<details class="fold"><summary>${esc(title)}<span class="plus"></span></summary><div class="fold-body">${groups.length ? `<table class="compact"><thead><tr><th>Nhóm</th><th style="text-align:right">Số bài</th><th style="text-align:right">Trung vị lượt xem</th></tr></thead>
    <tbody>${groups.map((g) => `<tr><th scope="row">${esc(g.label)}</th><td>${g.n}</td><td>${number(g.views)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">Chưa có bài đủ ngày 7 trong nhóm này.</p>'}</div></details>`;
}

function board(title, items) {
  const max = Math.max(1, ...items.map((i) => i.points));
  return `<div class="panel board"><h3>${esc(title)}</h3><ol>${items.map((it, i) => `<li><span class="r">${i + 1}</span>
    <span class="nm"><span>${esc(it.label)}</span><span class="bar"><i style="width:${Math.max(2, (it.points / max) * 100)}%"></i></span></span><b>${number(it.points)}</b></li>`).join('')}</ol></div>`;
}

function viewChart(rows, accounts) {
  const points = rows.filter((p) => p.d7?.views != null).sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  if (!points.length) return '';
  const width = 680, height = 236, left = 64, bottom = 180;
  const maxLog = Math.max(1, Math.ceil(Math.log10(Math.max(...points.map((p) => p.d7.views)) + 1)));
  const minTime = Date.parse(points[0].published_at), maxTime = Date.parse(points.at(-1).published_at);
  const x = (p) => left + (Date.parse(p.published_at) - minTime) / Math.max(1, maxTime - minTime) * (width - left - 22);
  const y = (v) => bottom - Math.log10(v + 1) / maxLog * 156;
  const color = (p) => COLORS[Math.max(0, accounts.findIndex((a) => a.id === p.account_id)) % COLORS.length];
  return `<figure class="panel chart"><figcaption><span>Lượt xem ngày 7 theo ngày đăng</span><span class="tiny muted">thang log · ${points.length} bài</span></figcaption>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ lượt xem ngày 7. Trục đứng dùng thang log để các bài nhiều lượt xem không che mất bài còn lại.">
    ${Array.from({ length: maxLog + 1 }, (_, i) => `<line x1="${left}" x2="${width - 10}" y1="${y(10 ** i - 1)}" y2="${y(10 ** i - 1)}" stroke="#dcd4c5" stroke-dasharray="${i ? '3 4' : ''}"/><text x="${left - 8}" y="${y(10 ** i - 1) + 4}" text-anchor="end">${i === 0 ? '0' : number(10 ** i - 1)}</text>`).join('')}
    ${points.map((p) => `<circle cx="${x(p)}" cy="${y(p.d7.views)}" r="7" fill="${color(p)}" fill-opacity=".85" stroke="#fbf7ee" stroke-width="1.5"><title>${esc(accounts.find((a) => a.id === p.account_id)?.handle)} · ${date(p.published_at)} · ${number(p.d7.views)} lượt xem</title></circle>`).join('')}
    <text x="${left}" y="224">${dayLabel(points[0].published_at)}</text><text x="${width - 10}" y="224" text-anchor="end">${dayLabel(points.at(-1).published_at)}</text></svg>
    ${accounts.length <= 3 ? `<div class="chart-key">${accounts.map((a, i) => `<span style="--key:${COLORS[i]}">@${esc(a.handle)}</span>`).join('')}</div>` : ''}</figure>`;
}

function postRow(p, team, data, sample) {
  const account = team.accounts.find((a) => a.id === p.account_id);
  const status = p.age < 7 ? `Đang tăng · ${Math.floor(p.age)} ngày` : p.d7 ? 'Đã có lần đọc ngày 7' : 'Thiếu lần đọc ngày 7';
  const current = p.latest;
  const themes = current?.reply_themes ?? [];
  const versions = data.versions.filter((v) => v.post_id === p.id).sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
  const metric = (label, v) => `<div><dt>${label}</dt><dd>${v == null ? '–' : number(v)}</dd></div>`;
  return `<details class="fold"><summary><span class="post-sum"><span class="t">${esc(firstLine(p.version?.op || p.card?.op || 'Bài sáng tạo'))}</span>
      <span class="m">@${esc(account?.handle)} · ${esc(status)} · ${number(current?.views)} xem</span></span><span class="plus"></span></summary>
    <div class="fold-body">
    <p class="small muted">Đăng ${date(p.published_at)} · Đọc ${date(current?.captured_at)} · ${p.match_method === 'text' ? 'Ghép bằng nội dung, chưa thấy ct' : p.match_method === 'ct' ? 'Ghép bằng ct' : 'Bài sáng tạo'}</p>
    <dl class="metrics">${metric('Xem', current?.views)}${metric('Thích', current?.likes)}${metric('Trả lời người khác', current?.other_replies)}${metric('Đăng lại', current?.reposts)}${metric('Trích dẫn', current?.quotes)}</dl>
    <p class="small">Điểm tương tác <b style="font-weight:500">${number(p.scoring.score)}</b>${p.scoring.n ? ` · so với ${p.scoring.n} bài trước${p.scoring.n < 14 ? ', điểm tạm' : ''}` : ' · cần lịch sử ngày 7'}. Lượt cài ${p.installs == null ? 'chưa có báo cáo' : number(p.installs)} · ${number(p.installPoints)} điểm cài.</p>
    ${!sample && /^https:\/\/(www\.)?threads\.(net|com)\//.test(p.source_url ?? '') ? `<p><a class="linkish" href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">Mở bài đã đăng${icon('out')}</a></p>` : ''}
    ${themes.length ? `<p class="eyebrow" style="margin:16px 0 4px">Bình luận · máy đọc ${current.reply_sample_size} bình luận · ${esc(current.model)}</p><ul class="themes">${themes.map((t) => `<li>${esc(t.theme)}${t.count != null ? ` <span class="tiny muted">· ${number(t.count)} trong mẫu</span>` : ''}</li>`).join('')}</ul>` : '<p class="small muted" style="margin-top:10px">Chưa có mẫu đọc bình luận.</p>'}
    ${versions.length ? `<details class="alt" style="margin:12px 0 0"><summary>Nội dung đã đăng và các lần sửa<span class="plus"></span></summary>${versions.map((v) => `<section class="version"><p class="tiny muted">Đọc ${date(v.captured_at)}</p>${['op', 'r1', 'r2'].map((part) => v[part] == null ? '' : `<h4>${{ op: 'Bài đăng', r1: 'Bình luận 1', r2: 'Bình luận 2' }[part]}</h4><p class="plain">${esc(v[part])}</p>${v.changed_parts?.includes(part) ? `<p class="tiny muted" style="margin-top:8px">Bản viết sẵn</p><p class="quote" style="font-size:15px">${esc(v.writer_text?.[part] ?? 'Chưa có')}</p><p class="tiny muted" style="margin-top:8px">Lần sao chép gần nhất trước khi đăng</p><p class="quote" style="font-size:15px">${esc(v.copied_text?.[part] ?? 'Chưa ghi nhận sao chép')}</p>` : ''}`).join('')}</section>`).join('')}</details>` : ''}
    <details class="alt" style="margin:0"><summary>Lịch sử số liệu<span class="plus"></span></summary><ul class="readings">${data.observations.filter((o) => o.post_id === p.id).sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at)).map((o) => `<li>${date(o.captured_at)} · ${number(o.views)} xem · ${number(o.likes)} thích · ${number(o.other_replies)} trả lời của người khác</li>`).join('')}</ul></details>
  </div></details>`;
}

const repaint = (s) => { const y = window.scrollY; paint(s); window.scrollTo(0, y); };

function paint(s) {
  const { main, ctx } = s;
  const data = s.sample ? demoAnalytics(ctx.team) : s.data;
  const enriched = enrichPosts(data);
  const weeks = [...new Set(enriched.map((p) => p.week))].sort().reverse();
  const laneAccounts = ctx.team.accounts.filter((a) => a.kind === s.lane && (!s.member || a.member_id === s.member));
  const accounts = laneAccounts.filter((a) => !s.compare.length || s.compare.includes(a.id));
  const rows = enriched.filter((p) => accounts.some((a) => a.id === p.account_id) && (!s.week || p.week === s.week));
  const total = summarize(rows);
  const groups = accounts.map((a) => ({ ...a, ...summarize(rows.filter((p) => p.account_id === a.id)) }))
    .sort((a, b) => (b[s.sort] ?? -1) - (a[s.sort] ?? -1) || a.handle.localeCompare(b.handle));
  const memberGroups = ctx.team.members.filter((m) => accounts.some((a) => a.member_id === m.id))
    .map((m) => ({ ...m, ...summarize(rows.filter((p) => accounts.some((a) => a.id === p.account_id && a.member_id === m.id))) }))
    .sort((a, b) => b.points - a.points);
  const latestRun = [...data.runs].sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))[0];
  const keywords = new Map(data.keywords.map((k) => [k.card_id, data.keywords.filter((x) => x.card_id === k.card_id).map((x) => x.keyword)]));
  const laneRows = enriched.filter((p) => (!s.week || p.week === s.week)
    && ctx.team.accounts.some((a) => a.id === p.account_id && (!s.member || a.member_id === s.member)));
  const laneComparison = ['card', 'creative'].map((kind) => ({ label: kind === 'card' ? 'Bài có sẵn' : 'Bài sáng tạo',
    ...summarize(laneRows.filter((p) => ctx.team.accounts.some((a) => a.id === p.account_id && a.kind === kind))) }));
  const themeRows = rows.filter((p) => p.latest?.reply_themes?.length).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const newest = [...rows].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const handle = (id) => ctx.team.accounts.find((a) => a.id === id)?.handle;
  const chart = viewChart(rows, accounts);
  const readLine = s.sample ? 'Đang xem số liệu mẫu'
    : latestRun ? `Lần đọc gần nhất ${date(latestRun.finished_at)}${latestRun.status !== 'complete' ? ' · chưa đọc đủ tài khoản' : ''}` : 'Chưa có lần đọc Threads';

  const body = !rows.length ? `<section class="stage empty-stage"><p class="eyebrow">Chưa có bài trong lựa chọn này</p>
      <h2>Số liệu hiện ở đây sau lần đọc Threads đầu tiên.</h2>
      <p class="muted">Chọn tài khoản, sao chép bài ở Hôm nay rồi đăng trên Threads. Lần đọc hằng ngày trên máy Nam ghi nhận bài và số liệu.</p>
      <div class="actions"><a class="btn btn-gold" href="#/">Mở Hôm nay${icon('right')}</a>${s.sample ? '' : `<button class="btn btn-ghost" data-sample>${icon('eye')}Xem số liệu mẫu</button>`}</div></section>`
    : `<div class="overview"><section class="stage"><p class="eyebrow">Trung vị ngày 7 · ${total.n} bài</p>
      <div class="summary-stage">${big(total.views, 'Lượt xem')}${big(total.other_replies, 'Trả lời của người khác')}${big(total.reposts, 'Đăng lại')}</div>
      <p class="summary-foot"><span>${total.n} bài có lần đọc ngày 7 / ${total.posts} bài đã đăng. Số chưa đọc không tính thành 0.</span><span>${total.installs} lượt cài được báo cáo</span></p></section>
    ${chart}</div>
    <section class="section"><div class="section-head"><div><p class="eyebrow">Tài khoản</p><h2 class="section-title">Từng tài khoản</h2></div>
      <label><span class="sr-only">Sắp xếp theo</span><select id="sort">${SORTS.map(([v, l]) => option(v, `Sắp xếp: ${l}`, s.sort)).join('')}</select></label></div>
      ${accountCards(groups)}</section>
    <section class="section"><div class="section-head"><div><p class="eyebrow">Xếp hạng</p><h2 class="section-title">${s.week ? `Tuần ${esc(s.week)}` : 'Các tuần đã chọn'}</h2>
      <p class="sub">${total.scored} bài có điểm tương tác${total.provisional ? `, ${total.provisional} bài điểm tạm` : ''}. ${total.installs} lượt cài được báo cáo.</p></div></div>
      <div class="boards">${board('Thành viên', memberGroups.map((m) => ({ label: m.name, points: m.points })))}${board('Tài khoản', [...groups].sort((a, b) => b.points - a.points).map((a) => ({ label: `@${a.handle}`, points: a.points })))}</div>
      <div class="folds"><details class="fold"><summary>Cách tính điểm<span class="plus"></span></summary><div class="fold-body explain"><p>Điểm tương tác là trung bình của lượt xem, lượt thích và trả lời của người khác, mỗi số chia cho trung vị ngày 7 của 14 bài trước trên cùng tài khoản. Mỗi tỷ lệ tối đa 5. Mẫu số bằng 0 được tính là 1.</p><p>Chưa có lịch sử thì chưa có điểm tương tác. Có dưới 14 bài đủ số liệu thì điểm được ghi là tạm. Mỗi lượt cài có báo cáo theo ct được 3 điểm. Chưa thấy báo cáo thì 0 điểm cài, không có nghĩa là 0 lượt cài thật.</p><p>Bài dưới 7 ngày vẫn hiển thị số mới nhất với nhãn "đang tăng". Chỉ lần đọc đầu tiên trong khoảng 168 đến dưới 192 giờ mới vào trung vị và điểm ngày 7.</p></div></details></div></section>
    <section class="section"><div class="section-head"><div><p class="eyebrow">So sánh</p><h2 class="section-title">Bài nào đang hiệu quả?</h2>
      <p class="sub">So trung vị ngày 7, luôn kèm số bài. Đây là mô tả mẫu đã đọc, chưa đủ để kết luận nguyên nhân.</p></div></div>
      <div class="folds">${groupTable(laneComparison, 'Bài có sẵn và bài sáng tạo · cùng thành viên, cùng tuần')}
      ${s.lane === 'card' ? groupTable(breakdown(rows, (p) => PULL_LABEL[p.card?.pull]), 'Theo dự đoán sức hút') + groupTable(breakdown(rows, (p) => ENGINE_LABEL[p.card?.engine]), 'Theo cách kéo bình luận') + groupTable(breakdown(rows, (p) => FIT[p.card?.fit]), 'Theo độ khớp ngách') + groupTable(breakdown(rows, (p) => keywords.get(p.card_id) ?? ['Chưa có từ khóa nguồn']), 'Theo nhóm từ khóa') : ''}
      ${s.lane === 'card' ? groupTable(breakdown(rows, (p) => `@${handle(p.account_id)} · ${p.version ? p.version.changed_parts?.length ? 'Có sửa' : 'Giữ nguyên' : 'Chưa đọc nội dung'}`), 'Bài có sửa và giữ nguyên trong từng tài khoản') : ''}</div></section>
    <section class="section"><div class="section-head"><div><p class="eyebrow">Bình luận</p><h2 class="section-title">Người đọc đang nói gì?</h2>
      <p class="sub">Nhận định của máy từ mẫu bình luận từng bài. Không coi mẫu là toàn bộ người đọc.</p></div></div>
      ${themeRows.length ? `<ul class="panel themes" style="padding-top:6px;padding-bottom:6px">${themeRows.slice(0, s.more.themes).map((p) => `<li><span class="who">@${esc(handle(p.account_id))} · ${date(p.published_at)} · mẫu ${p.latest.reply_sample_size} bình luận · ${esc(p.latest.model)}</span>${p.latest.reply_themes.map((t) => esc(t.theme)).join(' · ')}</li>`).join('')}</ul>${more('themes', s.more.themes, themeRows.length)}` : '<p class="small muted">Chưa có mẫu đọc bình luận.</p>'}</section>
    <section class="section posts-list"><div class="section-head"><div><p class="eyebrow">Chi tiết</p><h2 class="section-title">Từng bài</h2></div><span class="count">${rows.length} bài</span></div>
      ${newest.slice(0, s.more.posts).map((p) => postRow(p, ctx.team, data, s.sample)).join('')}${more('posts', s.more.posts, newest.length)}</section>`;

  main.innerHTML = `<div class="page-head"><div><p class="eyebrow">Số liệu</p><h1 class="page-title">Kết quả ngày 7</h1>
      <p class="sub">${esc(readLine)}. Trả lời chỉ tính người khác.</p></div>
      ${rows.length || s.sample ? `<button class="btn ${s.sample ? 'btn-ink' : 'btn-line'} sm" data-sample>${s.sample ? 'Về số liệu thật' : `${icon('eye')}Số liệu mẫu`}</button>` : ''}</div>
    ${s.sample ? `<p class="notice" role="status">${icon('info')}<span>Đang xem số liệu mẫu. Các con số được tạo để thử giao diện, không phải kết quả Threads hay lượt cài thật.</span></p>` : ''}
    <div class="toolbar"><div class="seg" role="group" aria-label="Loại tài khoản"><button type="button" data-lane="card" aria-pressed="${s.lane === 'card'}">Bài có sẵn</button><button type="button" data-lane="creative" aria-pressed="${s.lane === 'creative'}">Bài sáng tạo</button></div>
      <label style="display:contents"><span class="sr-only">Thành viên</span><select id="member">${option('', 'Cả nhóm', s.member)}${ctx.team.members.map((m) => option(m.id, m.name, s.member)).join('')}</select></label>
      <label style="display:contents"><span class="sr-only">Tuần đăng bài</span><select id="week">${option('', 'Mọi tuần', s.week)}${weeks.map((w) => option(w, `Tuần ${w}`, s.week)).join('')}</select></label></div>
    ${laneAccounts.length > 1 ? `<details class="flag" style="margin:0 0 16px;border:0"${s.compare.length ? ' open' : ''}><summary>${icon('stats')}So sánh tài khoản${s.compare.length ? ` · đã chọn ${s.compare.length}` : ' · tối đa 3'}</summary>
      <div class="chips" style="padding-bottom:6px">${laneAccounts.map((a) => `<button data-compare="${esc(a.id)}" aria-pressed="${s.compare.includes(a.id)}">@${esc(a.handle)}</button>`).join('')}</div></details>` : ''}
    ${body}`;

  main.querySelectorAll('[data-more]').forEach((b) => { b.onclick = () => { const y = window.scrollY; s.more[b.dataset.more] += PAGE * 3; repaint(s); window.scrollTo(0, y); }; });
  main.querySelectorAll('[data-sample]').forEach((b) => { b.onclick = () => { s.sample = !s.sample; s.week = ''; repaint(s); }; });
  main.querySelectorAll('[data-lane]').forEach((b) => { b.onclick = () => { s.lane = b.dataset.lane; s.compare = []; repaint(s); }; });
  main.querySelector('#member').onchange = (e) => { s.member = e.target.value; s.compare = []; repaint(s); };
  main.querySelector('#week').onchange = (e) => { s.week = e.target.value; repaint(s); };
  main.querySelector('#sort')?.addEventListener('change', (e) => { s.sort = e.target.value; repaint(s); });
  main.querySelectorAll('[data-compare]').forEach((b) => { b.onclick = () => {
    const id = b.dataset.compare;
    if (s.compare.includes(id)) s.compare = s.compare.filter((x) => x !== id);
    else if (s.compare.length < 3) s.compare.push(id);
    else { toast('Chọn tối đa 3 tài khoản để so sánh.'); return; }
    paint(s);
  }; });
}
