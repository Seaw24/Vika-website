// Content pillars (Nam, 2026-11-04; migration content_pillars). Every card and every post carries one pillar, labelled on
// the desktop by Claude Sonnet 5.5 (vika-ops tools/portal/pillars.cjs); any member can fix one in Studio. The 11 pillars
// are the team's list (relatable joined on 2026-11-07 from the team's reference, migration pillar_relatable); other is about fitness or Vika but in none of them; off_topic has nothing to do with either.
// The keys match the migration's check and pillars.cjs. Numbers here count a post's latest reading, like the rest of
// Bảng vàng.
// Nội dung's numbers follow how social tools report tags (research 2026-11-04: Socialinsider, Rival IQ, Brandwatch,
// Plausible): a ranked list per pillar with its posts, its average views and its lift against the team. Nam chose the
// average over the average (2026-11-04), so one big hit moves a pillar a lot; a pillar's lift speaks only from MIN_READ
// posts with a reading.
// Colours (2026-11-04, second design): ten jewel tones in the fixed order below, checked with the dataviz skill's
// validator on the lacquer (#1b1510) and the ivory (#fbf7ee): every adjacent pair clears CVD dE 8.5 and normal-vision
// dE 17.3, all inside the lightness band. Stacked charts draw in this order, so the checked pairs are the neighbours on
// screen, and every chart names its marks, since two tones sit under 3:1 on ivory. other and off_topic are warm greys.
// relatable's olive (2026-11-07) passes the same validator in both themes: CVD dE 8.2 against its neighbour news, and
// normal-vision dE 10.5 or more against every other tone.

export const PILLARS = [
  { key: 'educate', vi: 'Kiến thức', en: 'Educate', hint: 'Mẹo, cách tập, kiến thức về cơ thể', color: '#3f84d8' },
  { key: 'opinion', vi: 'Quan điểm', en: 'Opinion / Hot take', hint: 'Lập trường, nhận định, phản biện, có lý do', color: '#e0663d' },
  { key: 'story', vi: 'Kể chuyện', en: 'Storytelling', hint: 'Câu chuyện có diễn biến, trải nghiệm thật', color: '#9b6ad6' },
  { key: 'case_study', vi: 'Case study', en: 'Case Study', hint: 'Phân tích một trường hợp cụ thể: thương hiệu, sản phẩm, chiến dịch', color: '#2ea676' },
  { key: 'meme', vi: 'Meme / Hài', en: 'Meme / Humor', hint: 'Đùa, meme, tự trào cho vui', color: '#c27e16' },
  { key: 'engagement', vi: 'Thảo luận', en: 'Discussion', hint: 'Câu hỏi mở, lựa chọn A/B, mời chia sẻ trải nghiệm', color: '#df5f8c' },
  { key: 'review', vi: 'Review', en: 'Review / Recommendation', hint: 'Đánh giá, gợi ý, so sánh sản phẩm', color: '#16a0b5' },
  { key: 'bts', vi: 'Hậu trường', en: 'Behind the Scenes', hint: 'Phía sau công việc, dự án, cách làm nội dung', color: '#b8742f' },
  { key: 'trend', vi: 'Trend', en: 'Trend / Challenge', hint: 'Bắt trend, thử thách đang hot', color: '#8a7cf2' },
  { key: 'news', vi: 'Tin tức', en: 'News / Updates', hint: 'Tin mới, nghiên cứu, cập nhật', color: '#c45a5a' },
  { key: 'relatable', vi: 'Đồng cảm', en: 'Relatable', hint: 'Suy nghĩ, cảm xúc, mong muốn mà nhiều người thấy mình trong đó', color: '#8f9a1a' },
  { key: 'other', vi: 'Khác', en: 'Other', hint: 'Về tập luyện, cơ thể hoặc Vika nhưng ngoài các dạng trên', color: '#8f877b' },
  { key: 'off_topic', vi: 'Không liên quan', en: 'Not relevant', hint: 'Không liên quan đến tập luyện hay Vika', color: '#6f675c' },
];
export const NONE = { key: 'none', vi: 'Chưa gắn', en: 'Not labelled', hint: 'Đang chờ lần đọc sau để tự động gắn nhãn', color: '#cfc5b3' };
// The team's 11, without other, off_topic and none.
export const PLAN = PILLARS.slice(0, 11).map((p) => p.key);
export const MIN_READ = 5;
const BY_KEY = new Map([...PILLARS, NONE].map((p) => [p.key, p]));
export const pillarMeta = (key) => BY_KEY.get(key ?? 'none') ?? NONE;
// A post with this many views is a hit, as in the rest of Bảng vàng (lib/board.js HIT).
export const HIT_VIEWS = 10000;

// What Nội dung measures a pillar by (Nam, 2026-11-04: likes, replies and reposts count too, not only views). Views are
// the average per read post. Likes, replies and reposts are kept per 1,000 views and shown as a percentage of views, so a pillar that reaches more people does
// not win on them by reach alone; `avg` is the plain average a post gets, for the readout.
export const METRICS = [
  { key: 'views', vi: 'Lượt xem', short: 'Xem', unit: 'lượt xem mỗi bài', of: (st) => st.avg, avg: (st) => st.avg, field: (r) => r.views },
  { key: 'likes', vi: 'Thích', short: 'Thích', unit: 'lượt xem có lượt thích', pct: true, of: (st) => st.likeRate, avg: (st) => st.avgLikes, field: (r) => r.likes },
  { key: 'replies', vi: 'Trả lời', short: 'Trả lời', unit: 'lượt xem có lượt trả lời', pct: true, of: (st) => st.replyRate, avg: (st) => st.avgReplies, field: (r) => r.replies },
  { key: 'reposts', vi: 'Đăng lại', short: 'Đăng lại', unit: 'lượt xem có lượt đăng lại', pct: true, of: (st) => st.spread, avg: (st) => st.avgReposts, field: (r) => r.reposts },
];
export const metricOf = (key) => METRICS.find((mt) => mt.key === key) ?? METRICS[0];

// Who writes the replies under a pillar's posts, and what readers say. The 6-hour read sorts each post's sampled replies
// into themes with a count and a kind (reader, how_to_train, seller, seeder). Reads before the kinds existed have none:
// a theme that names a gym, a trainer, a price, an inbox or a shop is counted as a seller's, any other as a reader's.
const SELLER_WORDS = /\bPT\b|phòng (gym|tập|yoga)|chào giá|báo giá|inbox|ib |tư vấn|shopee|link|máy nâng|giới thiệu (một )?app|app (đếm|tính)|quảng cáo/i;
export function themeKind(t) {
  if (['reader', 'how_to_train', 'seller', 'seeder'].includes(t.kind)) return t.kind === 'seeder' ? 'seller' : t.kind;
  return SELLER_WORDS.test(t.theme ?? '') ? 'seller' : 'reader';
}
// rows are posts with `reading` (their latest observation). Returns { sampled, posts, mix: { reader, how_to_train,
// seller } counts of replies, top: up to `max` reader and how-to-train themes, most replies first, each with its post }.
export function replyVoices(rows, max = 4) {
  const mix = { reader: 0, how_to_train: 0, seller: 0 };
  const themes = [];
  let posts = 0;
  for (const r of rows) {
    const list = r.reading?.reply_themes ?? [];
    if (!list.length) continue;
    posts++;
    for (const t of list) {
      const kind = themeKind(t);
      const count = Math.max(1, t.count ?? 1);
      mix[kind] += count;
      if (kind !== 'seller') themes.push({ theme: t.theme, count, kind, row: r });
    }
  }
  const sampled = mix.reader + mix.how_to_train + mix.seller;
  return { sampled, posts, mix, top: themes.sort((a, b) => b.count - a.count).slice(0, max) };
}

// A post's pillar is its own; a post read before its label falls back to its card's.
export const pillarOf = (row) => row.pillar ?? row.card?.pillar ?? null;
export const ofPillar = (rows, key) => !key ? rows : rows.filter((r) => (pillarOf(r) ?? 'none') === key);

const mean = (values) => {
  const v = values.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const whole = (v) => (v == null ? null : Math.round(v));

// The numbers of one group of posts. Views and the rates count only posts with a reading.
export function groupStats(rows) {
  const read = rows.filter((r) => r.views != null);
  const views = read.reduce((s, r) => s + r.views, 0);
  const acts = read.reduce((s, r) => s + (r.likes ?? 0) + (r.replies ?? 0) + (r.reposts ?? 0), 0);
  const replies = read.reduce((s, r) => s + (r.replies ?? 0), 0);
  const reposts = read.reduce((s, r) => s + (r.reposts ?? 0), 0);
  const likes = read.reduce((s, r) => s + (r.likes ?? 0), 0);
  return {
    posts: rows.length, read: read.length, views, avg: whole(mean(read.map((r) => r.views))),
    // Likes per 1,000 views, and the average likes, replies and reposts a post gets (Nam, 2026-11-04: not only views).
    likeRate: views ? (likes / views) * 1000 : null,
    avgLikes: read.length ? likes / read.length : null,
    avgReplies: read.length ? replies / read.length : null,
    avgReposts: read.length ? reposts / read.length : null,
    // Likes, replies and reposts per 1,000 views: how much the readers who saw it did something.
    engage: views ? (acts / views) * 1000 : null,
    replyRate: views ? (replies / views) * 1000 : null,
    // Reposts per 1,000 views: how far a post travels; the picker's outcome is the same rate.
    spread: views ? (reposts / views) * 1000 : null,
    best: read.reduce((b, r) => (!b || r.views > b.views ? r : b), null),
    seeding: rows.filter((r) => !r.creative).length, creative: rows.filter((r) => r.creative).length,
  };
}

// One row per pillar with posts in the period (and every pillar in `keep`), sorted by `sort`. prevRows are the period
// before, for the change in posts and in average views. lift is the pillar's average against the average of every post in
// the period; solid says the pillar has MIN_READ read posts, so its average and lift mean something.
export function pillarTable(rows, prevRows = [], { sort = 'posts', keep = [] } = {}) {
  const total = rows.length;
  const totalViews = rows.reduce((s, r) => s + (r.views ?? 0), 0);
  const teamStats = groupStats(rows);
  const team = teamStats.avg;
  const keys = [...PILLARS.map((p) => p.key), 'none'];
  const list = keys.map((key) => {
    const mine = ofPillar(rows, key);
    const before = ofPillar(prevRows, key);
    const st = groupStats(mine);
    const prev = groupStats(before);
    const solid = st.read >= MIN_READ;
    const lifts = Object.fromEntries(METRICS.map((mt) => {
      const v = mt.of(st);
      const t = mt.of(teamStats);
      return [mt.key, v != null && t ? v / t : null];
    }));
    return { ...pillarMeta(key), ...st, share: total ? mine.length / total : 0, viewShare: totalViews ? st.views / totalViews : 0,
      prev, deltaPosts: mine.length - before.length, solid, lifts,
      lift: st.avg != null && team ? st.avg / team : null,
      deltaAvg: solid && prev.read >= MIN_READ && prev.avg ? st.avg / prev.avg - 1 : null, rows: mine };
  }).filter((p) => p.posts || keep.includes(p.key));
  // A pillar with too few read posts sorts below the solid ones on a average or a rate, so luck never tops the list.
  const rate = (field) => (a, b) => (b.solid - a.solid) || ((b[field] ?? -1) - (a[field] ?? -1)) || b.posts - a.posts;
  const by = {
    posts: (a, b) => b.posts - a.posts || (b.avg ?? -1) - (a.avg ?? -1),
    avg: rate('avg'),
    spread: rate('spread'),
    engage: rate('engage'),
    views: rate('avg'),
    likes: rate('likeRate'),
    replies: rate('replyRate'),
    reposts: rate('spread'),
  }[sort] ?? ((a, b) => b.posts - a.posts);
  // The two that are not pillars of the plan stay last, whatever the sort.
  const tail = (p) => (p.key === 'none' ? 3 : p.key === 'off_topic' ? 2 : p.key === 'other' ? 1 : 0);
  return list.sort((a, b) => tail(a) - tail(b) || by(a, b));
}

// The pillar that gets a member the most views: the best average among the team's pillars with at least `min` read posts.
export function bestPillar(table, min = 2) {
  return table.filter((p) => PLAN.includes(p.key) && p.read >= min && p.avg != null)
    .sort((a, b) => b.avg - a.avg)[0] ?? null;
}

// The log scale every row's strip of posts shares: the period's lowest to highest views with a little room at each end,
// at least 1.5 decades wide. at(v) is the place of v from 0 to 100. The ticks are the powers of ten inside it, and the
// 3s between them when the scale spans less than 3.2 decades.
export function viewScale(values) {
  const v = values.filter((x) => x != null && x > 0);
  let lo = Math.log10(Math.max(10, v.length ? Math.min(...v) : 100));
  let hi = Math.log10(Math.max(10 ** (lo + .5), v.length ? Math.max(...v) : 10000));
  const pad = .06 * (hi - lo) + .04;
  lo -= pad;
  hi += pad;
  if (hi - lo < 1.5) { const mid = (hi + lo) / 2; lo = mid - .75; hi = mid + .75; }
  const at = (x) => Math.min(100, Math.max(0, ((Math.log10(Math.max(x ?? 0, 1)) - lo) / (hi - lo)) * 100));
  const ticks = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
    for (const t of hi - lo < 3.2 ? [10 ** e, 3 * 10 ** e] : [10 ** e]) if (Math.log10(t) >= lo && Math.log10(t) <= hi) ticks.push(t);
  }
  return { lo, hi, at, ticks };
}

// Places a row's dots on up to three lanes, so posts with close views sit beside each other instead of on top: each dot
// takes the first lane (middle, above, below) whose last dot is at least `gap` away. xs must be sorted; returns lanes.
export function lanes(xs, gap = 1.8) {
  const last = [-Infinity, -Infinity, -Infinity];
  return xs.map((x) => {
    let lane = last.findIndex((l) => x - l >= gap);
    if (lane < 0) lane = last.indexOf(Math.min(...last));
    last[lane] = x;
    return lane;
  });
}

// Posts and average views per pillar per week: Map pillar key -> [{ posts, average }] in the order of `weeks`
// ([{ from, to }]). A pillar with no post in any of the weeks is left out.
export function weekSeries(rows, weeks) {
  const out = new Map();
  for (const key of [...PILLARS.map((p) => p.key), 'none']) {
    const mine = ofPillar(rows, key);
    const per = weeks.map((w) => mine.filter((r) => r.day >= w.from && r.day <= w.to));
    if (!per.some((list) => list.length)) continue;
    out.set(key, per.map((list) => ({ posts: list.length, avg: whole(mean(list.map((r) => r.views))) })));
  }
  return out;
}

// Unposted cards in the pool per pillar. pool is card_pool()'s rows (id per card); cards is every card with its pillar.
export function poolByPillar(pool, cards) {
  if (!pool) return null;
  const pillarOfCard = new Map(cards.map((c) => [c.id, c.pillar ?? null]));
  const out = new Map();
  for (const c of pool) {
    const key = pillarOfCard.get(c.id) ?? 'none';
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escText = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c]);

// The pillar as a tag: a quiet chip with the pillar's dot and its Vietnamese name; the team's English name and the
// meaning on hover. With edit, the tag is a button any member taps to fix the pillar (data-pillar-edit holds
// "<kind>:<id>").
export function pillarTag(key, { edit = null, quiet = false } = {}) {
  if (!key && !edit) return '';
  const p = pillarMeta(key);
  const title = escText(`${p.en}: ${p.hint}${edit ? '. Chạm để sửa' : ''}`);
  const cls = `pl-tag${key ? '' : ' is-none'}${quiet ? ' quiet' : ''}${p.key === 'off_topic' ? ' is-off' : ''}`;
  const inner = `<i class="pl-dot" aria-hidden="true"></i>${escText(p.vi)}`;
  return edit ? `<button type="button" class="${cls} is-edit" style="--pc:${p.color}" data-pillar-edit="${escText(edit)}" title="${title}" aria-label="Dạng bài: ${escText(p.vi)}. Sửa dạng bài">${inner}</button>`
    : `<span class="${cls}" style="--pc:${p.color}" title="${title}">${inner}</span>`;
}

// A member taps a tag to fix a pillar: a bottom sheet of the 12 with the current one marked. Resolves with the key she
// picks, or null when she closes it.
export function pickPillar(current) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'sheet pl-sheet';
    dialog.innerHTML = `<div class="sheet-grip"></div><h2>Đổi dạng bài</h2>
      <p class="pl-sheet-sub">Studio sẽ ghi tên bạn, và lần đọc tự động sau sẽ không ghi đè.</p>
      <div class="pl-opts">${PILLARS.map((p) => `<button type="button" class="pl-opt" style="--pc:${p.color}" data-choice="${p.key}" aria-pressed="${p.key === current}">
        <i class="pl-dot" aria-hidden="true"></i><span><b>${escText(p.vi)}</b><small>${escText(p.hint)}</small></span></button>`).join('')}</div>
      <button type="button" class="btn btn-line pl-cancel" data-choice="">Huỷ</button>`;
    document.body.append(dialog);
    const done = (choice) => { dialog.close(); dialog.remove(); resolve(choice || null); };
    dialog.addEventListener('click', (e) => {
      const b = e.target.closest('[data-choice]');
      if (b) done(b.dataset.choice); else if (e.target === dialog) done(null);
    });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    dialog.showModal();
  });
}

/* ---------- Nội dung's charts and insights (second design, 2026-11-04) ---------- */

// A squarified treemap: each item's rectangle has an area in proportion to its value, as close to square as the order
// allows (Bruls, Huizing and van Wijk). Items sort by value, largest first; returns [{ ...item, x, y, w, h }] in the
// units of W and H.
export function squarify(items, W, H) {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((sum, i) => sum + i.value, 0);
  if (!total) return [];
  const nodes = list.map((i) => ({ ...i, area: (i.value * W * H) / total }));
  const out = [];
  let x = 0, y = 0, w = W, h = H;
  const worst = (row, side) => {
    const sum = row.reduce((a, r) => a + r.area, 0);
    const big = Math.max(...row.map((r) => r.area));
    const small = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * big) / (sum * sum), (sum * sum) / (side * side * small));
  };
  const place = (row) => {
    const sum = row.reduce((a, r) => a + r.area, 0);
    if (w >= h) {
      const cw = sum / h;
      let cy = y;
      for (const r of row) { const rh = r.area / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw; w -= cw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const r of row) { const rw = r.area / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
  };
  let row = [];
  for (const node of nodes) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, node], side) <= worst(row, side)) row.push(node);
    else { place(row); row = [node]; }
  }
  if (row.length) place(row);
  return out.map(({ area, ...r }) => r);
}

// Each week's share of posts per pillar for a stacked chart: the `top` most posted of the team's pillars in the fixed
// order, then 'rest' for every other post. A week with no post has share null. Returns { keys, weeks: [{ from, to,
// posts, share: Map key -> 0..1 }] }.
export function mixByWeek(rows, weeks, top = 5) {
  const counts = new Map();
  for (const r of rows) { const key = pillarOf(r) ?? 'none'; counts.set(key, (counts.get(key) ?? 0) + 1); }
  const chosen = new Set(PLAN.filter((k) => counts.get(k)).sort((a, b) => counts.get(b) - counts.get(a)).slice(0, top));
  const keys = [...PLAN.filter((k) => chosen.has(k)), 'rest'];
  return { keys, weeks: weeks.map((w) => {
    const mine = rows.filter((r) => r.day >= w.from && r.day <= w.to);
    const share = new Map(keys.map((k) => [k, 0]));
    for (const r of mine) { const key = pillarOf(r) ?? 'none'; const k = chosen.has(key) ? key : 'rest'; share.set(k, share.get(k) + 1); }
    for (const k of keys) share.set(k, mine.length ? share.get(k) / mine.length : null);
    return { ...w, posts: mine.length, share };
  }) };
}

// Cards left in Kho bài per pillar against the seeding posts of that pillar per week in the window: how many weeks the
// stock lasts at the current pace. perWeek is null with no seeding post of the pillar in the window.
export function supply(pool, seedingRows, weeks) {
  if (!pool) return null;
  return PLAN.map((key) => {
    const stock = pool.get(key) ?? 0;
    const posted = ofPillar(seedingRows, key).length;
    const perWeek = posted ? posted / Math.max(1, weeks) : null;
    return { key, stock, perWeek, lasts: perWeek ? stock / perWeek : null };
  }).filter((x) => x.stock || x.perWeek);
}

// Each member's mix and her strongest pillar: the pillar of hers whose average beats her own average the most, from at
// least `min` read posts of it. Returns [{ member, posts, mix: Map key -> posts, best: { key, lift, posts } | null }].
export function memberMix(rows, members, min = 3) {
  return members.map((member) => {
    const mine = rows.filter((r) => r.member.id === member.id);
    const own = groupStats(mine).avg;
    const mix = new Map();
    for (const r of mine) { const key = pillarOf(r) ?? 'none'; mix.set(key, (mix.get(key) ?? 0) + 1); }
    let best = null;
    for (const key of PLAN) {
      const st = groupStats(ofPillar(mine, key));
      if (st.read < min || !own || st.avg == null) continue;
      const lift = st.avg / own;
      if (!best || lift > best.lift) best = { key, lift, posts: st.posts };
    }
    return { member, posts: mine.length, mix, best: best && best.lift > 1.1 ? best : null };
  }).filter((x) => x.posts).sort((a, b) => b.posts - a.posts);
}

// What the window says, most useful first, at most `max` of them. Each is { kind, ... } for the view to word; none
// speaks from fewer than MIN_READ read posts.
//   thin:    no pillar has MIN_READ read posts, so nothing can be compared yet
//   lead:    the solid pillar whose average beats the team's by 1.25 times or more
//   drag:    the most posted solid pillar, when its average is under 0.8 times the team's
//   short:   a pillar at 1.1 times the team or more whose cards in Kho bài last under 2 weeks at the current pace
//   hits:    the pillar with the most hits, when it holds half of 2 or more hits
//   talk:    the solid pillar with the most replies per 1,000 views, at 1.5 times the team's rate or more
//   spread:  the solid pillar with the most reposts per 1,000 views, at 1.5 times the team's rate or more
//   member:  the member with the largest lift on one of her pillars, at 1.5 times her own average or more
//   heavy:   the pillar with the most cards in Kho bài, when its average is under the team's and it lasts 6 weeks or more
//   unused:  the team's pillars with no post in the window, with the pool's cards for each
export function pillarInsights({ table, rows, pool = null, stock = null, members = [], max = 6 }) {
  const real = table.filter((p) => PLAN.includes(p.key) && p.posts);
  const solid = real.filter((p) => p.solid && p.lift != null);
  const team = groupStats(rows);
  const out = [];
  if (!solid.length && real.length) out.push({ kind: 'thin' });
  const lead = [...solid].sort((a, b) => b.lift - a.lift)[0];
  if (lead && lead.lift >= 1.25) out.push({ kind: 'lead', p: lead });
  const drag = [...solid].sort((a, b) => b.posts - a.posts)[0];
  if (drag && drag !== lead && drag.lift < .8) out.push({ kind: 'drag', p: drag });
  const left = new Map((stock ?? []).map((x) => [x.key, x]));
  const short = solid.filter((p) => p.lift >= 1.1 && left.get(p.key)?.lasts != null && left.get(p.key).lasts < 2)
    .sort((a, b) => b.lift - a.lift)[0];
  if (short) out.push({ kind: 'short', p: short, stock: left.get(short.key) });
  const hitsOf = (p) => p.rows.filter((r) => r.views >= HIT_VIEWS).length;
  const allHits = rows.filter((r) => r.views >= HIT_VIEWS).length;
  const hit = [...real].sort((a, b) => hitsOf(b) - hitsOf(a))[0];
  if (hit && allHits >= 2 && hitsOf(hit) / allHits >= .5) out.push({ kind: 'hits', p: hit, hits: hitsOf(hit), of: allHits });
  const talk = [...solid].sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))[0];
  if (talk && team.replyRate && talk.replyRate >= team.replyRate * 1.5) out.push({ kind: 'talk', p: talk, team: team.replyRate });
  const spread = [...solid].sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0))[0];
  if (spread && team.spread && spread.spread >= team.spread * 1.5) out.push({ kind: 'spread', p: spread, team: team.spread });
  const star = memberMix(rows, members).filter((x) => x.best).sort((a, b) => b.best.lift - a.best.lift)[0];
  if (star && star.best.lift >= 1.5) out.push({ kind: 'member', member: star.member, best: star.best });
  const heavy = [...(stock ?? [])].sort((a, b) => b.stock - a.stock)[0];
  const heavyP = heavy && solid.find((p) => p.key === heavy.key);
  if (heavyP && heavyP.lift < 1 && heavy.lasts != null && heavy.lasts >= 6) out.push({ kind: 'heavy', p: heavyP, stock: heavy });
  const unused = PLAN.filter((key) => !real.some((p) => p.key === key))
    .map((key) => ({ key, stock: pool?.get(key) ?? 0 })).sort((a, b) => b.stock - a.stock);
  if (unused.length) out.push({ kind: 'unused', list: unused });
  return out.slice(0, max);
}

// The table's sort (Nam, 2026-11-04: sort like Supabase, several columns at once, each up or down). rules is
// [{ key, dir }] in priority order, dir 'desc' or 'asc'. A value that is missing goes last in either direction. When the
// first rule is a rate or the lift, a pillar under MIN_READ read posts sorts after the solid ones, so one lucky post never
// tops the list.
export const SORT_COLS = [['posts', 'Số bài'], ['views', 'Views'], ['likes', 'Thích'], ['replies', 'Trả lời'], ['reposts', 'Đăng lại'], ['lift', 'So với nhóm']];
export const DEFAULT_SORT = [{ key: 'posts', dir: 'desc' }];
export function cleanSorts(rules) {
  const keys = new Set(SORT_COLS.map(([key]) => key));
  const seen = new Set();
  const out = (Array.isArray(rules) ? rules : []).filter((r) => r && keys.has(r.key) && !seen.has(r.key) && seen.add(r.key))
    .map((r) => ({ key: r.key, dir: r.dir === 'asc' ? 'asc' : 'desc' }));
  return out.length ? out : DEFAULT_SORT.map((r) => ({ ...r }));
}
export function sortValue(p, key, metric = 'views') {
  switch (key) {
    case 'posts': return p.posts;
    case 'views': return p.avg;
    case 'likes': return p.likeRate;
    case 'replies': return p.replyRate;
    case 'reposts': return p.spread;
    case 'lift': return p.lifts?.[metric] ?? null;
    default: return null;
  }
}
export function sortPillars(list, rules, metric = 'views') {
  const r = cleanSorts(rules);
  const solidFirst = r[0].key !== 'posts';
  return [...list].sort((a, b) => {
    if (solidFirst && a.solid !== b.solid) return a.solid ? -1 : 1;
    for (const { key, dir } of r) {
      const x = sortValue(a, key, metric);
      const y = sortValue(b, key, metric);
      if (x == null && y == null) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      if (x !== y) return dir === 'asc' ? x - y : y - x;
    }
    return b.posts - a.posts || a.vi.localeCompare(b.vi);
  });
}
