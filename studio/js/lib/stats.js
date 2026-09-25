import { mondayOf, vnDate } from './week.js';

export const DAY = 86400000;
export const METRICS = ['views', 'likes', 'other_replies'];
export const median = (values) => {
  const a = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : null;
};
export const ageDays = (post, now = Date.now()) => Math.max(0, (now - Date.parse(post.published_at)) / DAY);

// The first reading between 168 and 192 hours is the day-7 result. Later readings
// remain in the history but cannot inflate that cohort or score.
export function day7(post, observations, asOf = Date.now()) {
  const start = Date.parse(post.published_at) + 7 * DAY;
  return observations.filter((o) => o.post_id === post.id && Date.parse(o.captured_at) >= start
    && Date.parse(o.captured_at) < start + DAY && Date.parse(o.captured_at) <= asOf)
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))[0] ?? null;
}

export function scorePost(post, posts, observations, asOf = Date.now()) {
  const reading = day7(post, observations, asOf);
  if (!reading || METRICS.some((m) => reading[m] == null)) return { score: null, n: 0, baseline: null };
  const previous = posts.filter((p) => p.account_id === post.account_id && Date.parse(p.published_at) < Date.parse(post.published_at))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).slice(0, 14)
    // Only results already observable at this post's day-7 reading can set its baseline.
    .map((p) => day7(p, observations, Date.parse(reading.captured_at)))
    .filter((o) => o && METRICS.every((m) => o[m] != null));
  if (!previous.length) return { score: null, n: 0, baseline: null };
  const baseline = Object.fromEntries(METRICS.map((m) => [m, median(previous.map((o) => o[m]))]));
  const score = METRICS.reduce((sum, m) => sum + Math.min(5, reading[m] / Math.max(1, baseline[m])), 0) / 3;
  return { score, n: previous.length, baseline };
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
    const d7 = day7(post, observations, now);
    return { ...post, week: mondayOf(vnDate(new Date(post.published_at))), age: ageDays(post, now), latest: readings[0] ?? null,
      d7, scoring, version, card: cards.find((c) => c.id === post.card_id), installs: install?.installs ?? null,
      installPoints: (install?.installs ?? 0) * 3, points: (scoring.score ?? 0) + (install?.installs ?? 0) * 3 };
  });
}

export function summarize(rows) {
  const mature = rows.filter((p) => p.d7);
  return { posts: rows.length, n: mature.length,
    ...Object.fromEntries(['views', 'likes', 'other_replies', 'reposts'].map((m) => [m, median(mature.map((p) => p.d7[m]))])),
    engagement: rows.reduce((s, p) => s + (p.scoring.score ?? 0), 0),
    points: rows.reduce((s, p) => s + p.points, 0),
    installs: rows.reduce((s, p) => s + (p.installs ?? 0), 0),
    scored: rows.filter((p) => p.scoring.score != null).length,
    provisional: rows.filter((p) => p.scoring.score != null && p.scoring.n < 14).length,
    lastRead: rows.map((p) => p.latest?.captured_at).filter(Boolean).sort().at(-1) ?? null };
}

export function breakdown(rows, key) {
  const groups = new Map();
  for (const p of rows.filter((r) => r.d7)) {
    const value = key(p);
    for (const label of Array.isArray(value) ? value : [value ?? 'Chưa phân nhóm']) {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(p);
    }
  }
  return [...groups].map(([label, posts]) => ({ label, ...summarize(posts) }));
}
