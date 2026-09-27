import { esc } from '../ui.js';

// Pure builders for the statistics page: they return SVG or HTML strings and never touch the DOM,
// so they run in node for tests. Colours live in the stylesheet; every mark carries a class.

const fmt = (v) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(v);
const fmt1 = (v) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(v);
const r1 = (n) => Math.round(n * 10) / 10;
export const shortWeek = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
// A bar with rounded data-end and a square baseline: top corners only.
const topRound = (x, y, w, h, r) => { const c = Math.min(r, h, w / 2); return `M${r1(x)},${r1(y + h)}v${r1(-(h - c))}a${c},${c} 0 0 1 ${c},${-c}h${r1(w - 2 * c)}a${c},${c} 0 0 1 ${c},${c}v${r1(h - c)}z`; };

// Views of every post as it ages, drawn over the middle half of the mature posts (the band) and their median.
export const LC = { width: 720, height: 300, L: 54, R: 18, T: 18, B: 30, xMax: 5 };
export function lifecycleChart({ series, band, scale, width = LC.width, height = LC.height, xMax = LC.xMax, format = fmt }) {
  if (!series.length) return '';
  const { L, R, T, B } = LC;
  const x = (age) => r1(L + Math.min(age, xMax) / xMax * (width - L - R));
  const y = (v) => r1(T + (1 - scale.pos(v)) * (height - T - B));
  const grid = scale.ticks.map((t) => `<line class="ax-grid" x1="${L}" x2="${width - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax-lbl" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${format(t)}</text>`).join('');
  const days = Array.from({ length: xMax + 1 }, (_, d) => `<text class="ax-lbl" x="${x(d)}" y="${height - 9}" text-anchor="middle">${d}</text>`).join('');
  const day3 = `<line class="lc-day3" x1="${x(3)}" x2="${x(3)}" y1="${T - 4}" y2="${height - B + 4}"/><text class="ax-lbl lc-day3-lbl" x="${x(3)}" y="${T - 7}" text-anchor="middle">ngày 3</text>`;
  let bandSvg = '';
  if (band.days.length >= 2) {
    const up = band.days.map((d) => `${x(d.day)},${y(d.p75)}`), down = [...band.days].reverse().map((d) => `${x(d.day)},${y(d.p25)}`);
    bandSvg = `<polygon class="lc-band" points="${[...up, ...down].join(' ')}"/><polyline class="lc-median" points="${band.days.map((d) => `${x(d.day)},${y(d.median)}`).join(' ')}"/>`;
  }
  const line = (s) => {
    const pts = s.points.filter((p) => p.views != null && p.views > 0 && p.age <= xMax);
    if (!pts.length) return '';
    const last = pts.at(-1);
    return `<g class="lc-post" data-id="${esc(s.id)}"${s.slot != null ? ` data-slot="${s.slot}"` : ''}><title>${esc(s.label)}</title>` +
      `<polyline class="lc-line${s.young ? ' is-young' : ''}" points="${pts.map((p) => `${x(p.age)},${y(p.views)}`).join(' ')}"/>` +
      (s.young || s.slot != null ? `<circle class="lc-end" cx="${x(last.age)}" cy="${y(last.views)}" r="4.5"/>` : '') +
      (s.endLabel ? `<text class="lc-lbl" x="${x(last.age) + 8}" y="${y(last.views) + 4}">${esc(s.endLabel)}</text>` : '') + '</g>';
  };
  // Mature curves are the field; the band and median sit on the field; the young curves sit on top.
  const mature = series.filter((s) => !s.young).map(line).join(''), young = series.filter((s) => s.young).map(line).join('');
  return `<svg class="lc" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lượt xem của từng bài theo số ngày sau khi đăng, thang log">${grid}${days}${day3}${mature}${bandSvg}${young}</svg>`;
}

// One column per week: the week's median, the chosen week highlighted, weeks without a mature post as a stub.
export function weekColumns({ weeks, key = 'views', highlight, width = 320, height = 132, format = fmt }) {
  if (!weeks.length) return '';
  const T = 24, B = 22, L = 4, R = 4;
  const max = Math.max(1, ...weeks.map((w) => w[key] ?? 0));
  const slot = (width - L - R) / weeks.length, bw = Math.min(24, slot - 2);
  const cols = weeks.map((w, i) => {
    const v = w[key];
    const h = v == null ? 3 : Math.max(3, r1((height - T - B) * v / max));
    const cx = L + slot * i + slot / 2, hi = w.week === highlight;
    return `<g class="wk-col${hi ? ' is-hi' : ''}${v == null ? ' is-na' : ''}"><title>Tuần ${shortWeek(w.week)} · ${w.n} bài đủ ngày 3${v == null ? '' : ` · ${format(v)}`}</title>` +
      `<path d="${topRound(cx - bw / 2, height - B - h, bw, h, 4)}"/>` +
      (hi && v != null ? `<text class="wk-val" x="${r1(cx)}" y="${r1(height - B - h - 7)}" text-anchor="middle">${format(v)}</text>` : '') + '</g>';
  }).join('');
  return `<svg class="wk" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trung vị theo tuần">` +
    `<line class="wk-base" x1="${L}" x2="${width - R}" y1="${height - B}" y2="${height - B}"/>${cols}` +
    `<text class="ax-lbl" x="${L}" y="${height - 6}">${shortWeek(weeks[0].week)}</text>` +
    (weeks.length > 1 ? `<text class="ax-lbl" x="${width - R}" y="${height - 6}" text-anchor="end">${shortWeek(weeks.at(-1).week)}</text>` : '') + '</svg>';
}

// A dot per post along a shared log axis; rows and the axis header share one viewBox width so they line up.
export const STRIP = { width: 360, height: 44, pad: 10 };
const sx = (scale, v) => r1(STRIP.pad + scale.pos(v) * (STRIP.width - 2 * STRIP.pad));
// The axis is HTML, not SVG, so its labels keep their font size however wide the column gets.
export function stripAxis({ scale, format = fmt }) {
  const n = scale.ticks.length;
  return `<div class="sp-axis" aria-hidden="true">${scale.ticks.map((t, i) => `<span class="${i === 0 ? 'first' : i === n - 1 ? 'last' : ''}" style="left:${r1(sx(scale, t) / STRIP.width * 100)}%">${format(t)}</span>`).join('')}</div>`;
}
export function stripRow({ values, median, scale, label = '', format = fmt }) {
  const H = STRIP.height, mid = H / 2, r = 4, offsets = [0, -8, 8, -16, 16];
  const lanes = offsets.map(() => -Infinity);
  const dots = values.map((v) => ({ ...v, x: sx(scale, v.views) })).sort((a, b) => a.x - b.x).map((v) => {
    let lane = lanes.findIndex((lastX) => v.x - lastX >= 2 * r + 1);
    if (lane < 0) lane = 0;
    lanes[lane] = v.x;
    return `<circle class="sp-dot${v.young ? ' is-young' : ''}" data-id="${esc(v.id)}" cx="${v.x}" cy="${r1(mid + offsets[lane])}" r="${r}" tabindex="0"><title>${esc(v.title ?? '')}</title></circle>`;
  }).join('');
  const ticks = scale.ticks.map((t) => `<line class="ax-grid" x1="${sx(scale, t)}" x2="${sx(scale, t)}" y1="2" y2="${H - 2}"/>`).join('');
  const med = median == null ? '' : `<line class="sp-median" x1="${sx(scale, median)}" x2="${sx(scale, median)}" y1="1" y2="${H - 1}"><title>Trung vị ${format(median)}</title></line>`;
  return `<svg class="sp" viewBox="0 0 ${STRIP.width} ${H}" role="img" aria-label="${esc(label)}">${ticks}${med}${dots}</svg>`;
}

// Horizontal bars with the post count beside each label; groups under the floor are drawn thin.
export function barList({ rows, format = fmt, max, thin = 3 }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return `<div class="bl">${rows.map((r) => {
    const na = r.value == null, w = na ? 0 : Math.round(r.value / top * 100);
    return `<div class="bl-row${na ? ' is-na' : r.n < thin ? ' is-thin' : ''}"${r.id ? ` data-id="${esc(r.id)}"` : ''}><span class="bl-lbl"><span>${esc(r.label)}</span><small>${r.n} bài${!na && r.n < thin ? ' · ít' : ''}</small></span><span class="bl-bar" style="--w:${w}%"><i></i></span><b class="bl-val">${na ? '–' : format(r.value)}</b></div>`;
  }).join('')}</div>`;
}

// One post's own view curve, its own scale: the shape is the message, the number beside it gives the size.
export function sparkline({ points, width = 72, height = 24 }) {
  const pts = points.filter((p) => p.views != null);
  if (!pts.length) return '';
  const maxA = Math.max(1, ...pts.map((p) => p.age)), maxV = Math.max(1, ...pts.map((p) => p.views));
  const x = (a) => r1(3 + a / maxA * (width - 7)), y = (v) => r1(height - 3 - v / maxV * (height - 6));
  const last = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${[`${x(0)},${y(0)}`, ...pts.map((p) => `${x(p.age)},${y(p.views)}`)].join(' ')}"/><circle cx="${x(last.age)}" cy="${y(last.views)}" r="3"/></svg>`;
}

// A ratio against the account's usual post: the track runs to the cap, the mark sits at "usual".
export function meter({ ratio, cap = 5, mark = 1 }) {
  if (ratio == null) return '';
  return `<span class="meter" style="--w:${Math.round(Math.min(cap, ratio) / cap * 100)}%"><i></i><b class="meter-mark" style="left:${Math.round(mark / cap * 100)}%"></b></span>`;
}

// One row per account, one cell per day: did she post, and how did that post do against her usual.
const shortDay = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
const level = (c) => !c ? 'l0' : c.score == null ? (c.young ? 'is-young' : 'is-unscored') : c.score < 0.5 ? 'l1' : c.score < 1 ? 'l2' : c.score < 2 ? 'l3' : 'l4';
export function heatGrid({ days, rows, marks = [], format = fmt }) {
  const head = marks.length ? `<div class="hg-row hg-head"><span class="hg-lbl"></span><span class="hg-track">${days.map((_, i) => { const m = marks.find((k) => k.i === i); return `<i class="hg-mark">${m ? esc(m.text) : ''}</i>`; }).join('')}</span></div>` : '';
  return `<div class="hg" style="--cols:${days.length}">${head}${rows.map((r) => `<div class="hg-row"><span class="hg-lbl">${esc(r.label)}</span><span class="hg-track">${days.map((day) => {
    const c = r.cells[day];
    const title = c ? `${r.label} · ${shortDay(day)}${c.views != null ? ` · ${format(c.views)} xem` : ''}${c.score != null ? ` · điểm ${fmt1(c.score)}` : c.young ? ' · đang tăng' : ' · chưa có điểm'}` : `${r.label} · ${shortDay(day)} · không đăng`;
    return `<i class="hg-cell ${level(c)}"${c ? ` data-id="${esc(c.id)}" tabindex="0"` : ''} title="${esc(title)}"></i>`;
  }).join('')}</span></div>`).join('')}</div>`;
}
