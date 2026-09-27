import { mondayOf, vnDate } from './week.js';

export const DAY = 86400000;
export const METRICS = ['views', 'likes', 'other_replies'];
export const median = (values) => {
  const a = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : null;
};
export const ageDays = (post, now = Date.now()) => Math.max(0, (now - Date.parse(post.published_at)) / DAY);

// A post's result is its first reading at or after day 3 (Nam, 2026-09-27): views barely move after
// day 2 or 3, so a reading taken late because the desktop was off still counts.
export const RESULT_DAY = 3;
export function day3(post, observations, asOf = Date.now()) {
  const start = Date.parse(post.published_at) + RESULT_DAY * DAY;
  return observations.filter((o) => o.post_id === post.id && Date.parse(o.captured_at) >= start
    && Date.parse(o.captured_at) <= asOf)
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))[0] ?? null;
}

// A post scores every day (Nam, 2026-09-27). Before day 3 its latest reading is compared with the same
// account's previous posts at the same age, so a young post is not measured against older posts' totals;
// the score is marked growing. From its day-3 reading on it is compared with their day-3 readings and stays.
export function scorePost(post, posts, observations, asOf = Date.now()) {
  const none = { score: null, n: 0, baseline: null, reading: null, growing: false };
  const seen = observations.filter((o) => Date.parse(o.captured_at) <= asOf);
  const locked = day3(post, seen, asOf);
  const reading = locked && METRICS.every((m) => locked[m] != null) ? locked
    : locked ? null : readingsByAge(post, seen).filter((o) => METRICS.every((m) => o[m] != null)).at(-1) ?? null;
  if (!reading) return none;
  const at = Date.parse(reading.captured_at);
  const age = (at - Date.parse(post.published_at)) / DAY;
  const byNewest = (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at);
  // Only readings taken by the same morning read as this post's reading can set its baseline: a later
  // reading never moves a score that has locked.
  const cutoff = at + 6 * 3600000;
  const comparable = (list) => list.sort(byNewest).map((p) => {
    if (locked) return day3(p, seen, cutoff);
    const r = readingsByAge(p, seen.filter((o) => Date.parse(o.captured_at) <= cutoff));
    return Object.fromEntries(METRICS.map((m) => [m, metricAt(r, m, age)]));
  }).filter((o) => o && METRICS.every((m) => o[m] != null)).slice(0, 14);
  let previous = comparable(posts.filter((p) => p.account_id === post.account_id && Date.parse(p.published_at) < Date.parse(post.published_at)));
  // An account with no earlier post is compared with the team's other posts in its lane at the same age
  // (Nam, 2026-09-27), so a new account scores from its first post.
  const team = !previous.length;
  if (team) previous = comparable(posts.filter((p) => p.id !== post.id && p.account_id !== post.account_id && !p.assignment_id === !post.assignment_id));
  if (!previous.length) return { ...none, reading, growing: !locked };
  const baseline = Object.fromEntries(METRICS.map((m) => [m, median(previous.map((o) => o[m]))]));
  const score = METRICS.reduce((sum, m) => sum + Math.min(5, reading[m] / Math.max(1, baseline[m])), 0) / 3;
  return { score, n: previous.length, baseline, reading, growing: !locked, team };
}

export function enrichPosts({ posts = [], observations = [], installs = [], versions = [], cards = [] }, now = Date.now()) {
  return posts.map((post) => {
    const readings = observations.filter((o) => o.post_id === post.id && Date.parse(o.captured_at) <= now)
      .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
    const install = post.ct ? installs.filter((i) => i.ct === post.ct && Date.parse(i.captured_at) <= now)
      .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))[0] : null;
    const version = versions.filter((v) => v.post_id === post.id && Date.parse(v.captured_at) <= now)
      .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))[0];
    const scoring = scorePost(post, posts, observations, now);
    const d3 = day3(post, observations, now);
    return { ...post, week: mondayOf(vnDate(new Date(post.published_at))), age: ageDays(post, now), latest: readings[0] ?? null,
      d3, scoring, version, card: cards.find((c) => c.id === post.card_id), installs: install?.installs ?? null,
      installPoints: (install?.installs ?? 0) * 3, points: (scoring.score ?? 0) + (install?.installs ?? 0) * 3 };
  });
}

// Day-3 medians feed the weekly comparisons. The "now" medians take each post's day-3 reading, or its
// latest reading while it is younger (Nam, 2026-09-27: the numbers show every day, not only from day 3).
export function summarize(rows) {
  const mature = rows.filter((p) => p.d3);
  const current = rows.map((p) => p.d3 ?? p.latest).filter(Boolean);
  return { posts: rows.length, n: mature.length, read: current.length,
    ...Object.fromEntries(['views', 'likes', 'other_replies', 'reposts'].map((m) => [m, median(mature.map((p) => p.d3[m]))])),
    now: Object.fromEntries(['views', 'likes', 'other_replies', 'reposts'].map((m) => [m, median(current.map((o) => o[m]))])),
    engagement: rows.reduce((s, p) => s + (p.scoring.score ?? 0), 0),
    points: rows.reduce((s, p) => s + p.points, 0),
    installs: rows.reduce((s, p) => s + (p.installs ?? 0), 0),
    scored: rows.filter((p) => p.scoring.score != null).length,
    provisional: rows.filter((p) => p.scoring.score != null && p.scoring.n < 14).length,
    lastRead: rows.map((p) => p.latest?.captured_at).filter(Boolean).sort().at(-1) ?? null };
}

export function breakdown(rows, key) {
  const groups = new Map();
  for (const p of rows.filter((r) => r.d3)) {
    const value = key(p);
    for (const label of Array.isArray(value) ? value : [value ?? 'Chưa phân nhóm']) {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(p);
    }
  }
  return [...groups].map(([label, posts]) => ({ label, ...summarize(posts) }));
}

// ---- Helpers behind the charts (2026-09-25) ----
export const MIN_BAND = 3;
export const MIN_COMPARE = 3;
const log10 = (v) => Math.round(Math.log10(v) * 1e9) / 1e9;

export function percentile(values, p) {
  const a = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

// One entry per week that has a post, oldest first, with the week's medians and counts.
export function weeklySeries(rows) {
  const weeks = new Map();
  for (const p of rows) { if (!weeks.has(p.week)) weeks.set(p.week, []); weeks.get(p.week).push(p); }
  return [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, posts]) => ({ week, ...summarize(posts) }));
}

// The week asked for (or the latest with a mature post) against the previous week that had one.
// Rates need at least MIN_COMPARE mature posts on both sides; a zero base has no rate.
export function weekOverWeek(series, week) {
  const withData = series.filter((w) => w.n > 0);
  const current = (week ? series.find((w) => w.week === week) : withData.at(-1)) ?? null;
  if (!current) return { current: null, previous: null, delta: null };
  const previous = withData.filter((w) => w.week < current.week).at(-1) ?? null;
  const ok = previous && current.n >= MIN_COMPARE && previous.n >= MIN_COMPARE;
  const rate = (m) => previous[m] > 0 && current[m] != null ? (current[m] - previous[m]) / previous[m] : null;
  return { current, previous, delta: ok ? { views: rate('views'), other_replies: rate('other_replies'), reposts: rate('reposts') } : null };
}

// One post's readings with their age in days since publishing, oldest first.
export const readingsByAge = (post, observations) => observations.filter((o) => o.post_id === post.id)
  .map((o) => ({ ...o, age: (Date.parse(o.captured_at) - Date.parse(post.published_at)) / DAY }))
  .sort((a, b) => a.age - b.age);
export const indexReadings = (posts, observations) => new Map(posts.map((p) => [p.id, readingsByAge(p, observations)]));
const readingsOf = (post, source) => source instanceof Map ? (source.get(post.id) ?? []) : readingsByAge(post, source);

// A count at an age, interpolated between readings and from zero at publish. Up to 6 hours past the last
// reading it holds that reading, so posts read the same morning compare; nothing further out.
export function metricAt(readings, metric, age) {
  const r = readings.filter((o) => o[metric] != null);
  if (!r.length || age > r.at(-1).age + 0.25) return null;
  let prev = { age: 0, [metric]: 0 };
  for (const o of r) {
    if (o.age >= age) return o.age === prev.age ? o[metric] : prev[metric] + (o[metric] - prev[metric]) * (age - prev.age) / (o.age - prev.age);
    prev = o;
  }
  return r.at(-1)[metric];
}
export const viewsAt = (readings, age) => metricAt(readings, 'views', age);

// The middle half of the mature posts' view curves, day by day: what a usual post looks like on its way to day 3.
export function lifecycleBand(rows, source, days = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) {
  const mature = rows.filter((p) => p.d3).map((p) => readingsOf(p, source));
  if (mature.length < MIN_BAND) return { n: mature.length, days: [] };
  const out = [];
  for (const day of days) {
    const values = mature.map((r) => viewsAt(r, day)).filter((v) => v != null);
    if (values.length >= MIN_BAND) out.push({ day, n: values.length, p25: percentile(values, 0.25), median: percentile(values, 0.5), p75: percentile(values, 0.75) });
  }
  return { n: mature.length, days: out };
}

// Where a post stands, at the age of its latest reading, among the previous posts of the same account at that age.
export function rankAtAge(post, rows, source, limit = 14) {
  const last = readingsOf(post, source).filter((o) => o.views != null).at(-1);
  if (!last) return null;
  const previous = rows.filter((p) => p.account_id === post.account_id && Date.parse(p.published_at) < Date.parse(post.published_at))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).slice(0, limit)
    .map((p) => viewsAt(readingsOf(p, source), last.age)).filter((v) => v != null);
  if (!previous.length) return null;
  return { rank: 1 + previous.filter((v) => v > last.views).length, of: previous.length, age: last.age, views: last.views };
}

const themeKey = (t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?…]+$/g, '').trim();
// The same theme across posts, merged on spelling alone; the first spelling seen is the one shown.
export function themeCounts(rows) {
  const map = new Map();
  for (const p of rows) for (const t of p.latest?.reply_themes ?? []) {
    const key = themeKey(t.theme);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { theme: String(t.theme).trim().replace(/[.,;:!?…]+$/g, ''), posts: 0, mentions: 0, ids: [] });
    const e = map.get(key);
    e.posts++; e.mentions += t.count ?? 0; e.ids.push(p.id);
  }
  return [...map.values()].sort((a, b) => b.posts - a.posts || b.mentions - a.mentions || a.theme.localeCompare(b.theme));
}

// A log axis from the power of ten under the smallest value (never under 10) to the one over the largest.
export function logScale(values) {
  const positive = values.filter((v) => typeof v === 'number' && v > 0);
  const lo = Math.max(10, positive.length ? 10 ** Math.floor(log10(Math.min(...positive))) : 10);
  let hi = positive.length ? 10 ** Math.ceil(log10(Math.max(...positive))) : 100;
  if (hi <= lo) hi = lo * 10;
  const ticks = [];
  for (let t = lo; t <= hi; t *= 10) ticks.push(t);
  const a = log10(lo), b = log10(hi);
  return { lo, hi, ticks, pos: (v) => (log10(Math.min(hi, Math.max(lo, v ?? lo))) - a) / (b - a) };
}

// Rank change per id: positive means it climbed; null when it was not ranked before.
export function movement(current, previous) {
  const prev = new Map(previous.map((id, i) => [id, i]));
  return new Map(current.map((id, i) => [id, prev.has(id) ? prev.get(id) - i : null]));
}
