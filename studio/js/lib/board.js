// Bảng vàng (Nam, 2026-11-03): the team's numbers, a weekly game and a profile per member, from the daily read's posts.
// Ranking is effort plus results: XP for each post and each day she posts, more when a post beats her account's normal
// views, and a bonus for a hit. A member controls her posting, so effort counts; luck still pays through the hits.
// Only computed facts, no model text. Weeks run Monday to Sunday in Vietnam time.
import { vnDate, mondayOf, addDays } from './week.js';

// quest: a day on which she met the daily target a manager set (Nam, 2026-11-03). extra: each post over the target on
// a met day or a rest day (Nam, 2026-11-04: the target is the minimum, more posts show and earn XP).
export const XP = { post: 10, day: 5, beat: 20, hit: 50, mega: 100, quest: 15, extra: 5 };
export const HIT = 10_000;
export const MEGA = 100_000;
// A post beats her account's normal at twice the median views of the account's previous posts (at most 14 of them).
// An account with fewer than 3 earlier posts uses the team's earlier posts. A normal under 100 counts as 100, so a new
// account's 60-view posts do not make every 120-view post a win.
export const BEAT = 2;
const NORMAL_POSTS = 14;
const NORMAL_FLOOR = 100;
const DAY = 86_400_000;

const median = (values) => {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Level n starts at 25·(n−1)² XP: 25, 100, 225, 400 … so each level asks a little more than the one before.
export const LEVEL_STEP = 25;
const TITLES = [[9, 'Huyền thoại'], [7, 'Ngôi sao'], [5, 'Có tiếng'], [3, 'Đều tay'], [1, 'Tập sự']];
export function level(xp) {
  const n = Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_STEP)) + 1;
  const from = LEVEL_STEP * (n - 1) ** 2;
  const to = LEVEL_STEP * n ** 2;
  return { n, title: TITLES.find(([min]) => n >= min)[1], from, to, progress: (xp - from) / (to - from), left: to - xp };
}

// The newest reading of each post at or before now.
function latestReadings(observations, now) {
  const out = new Map();
  for (const o of observations) {
    if (Date.parse(o.captured_at) > now) continue;
    const had = out.get(o.post_id);
    if (!had || o.captured_at > had.captured_at) out.set(o.post_id, o);
  }
  return out;
}

// The download link in her post or her own replies (Nam, 2026-11-05): Vika's App Store address or a campaign code. The
// reading run saves the post and her first two replies with every read, so a post never read has no answer (null).
const APP_LINK = /apps\.apple\.com\/\S*id6768359920|[?&]ct=[a-z0-9_]+/i;
export const hasAppLink = (v) => (v ? APP_LINK.test([v.op, v.r1, v.r2].filter(Boolean).join('\n')) : null);

// Every post of a team member with its numbers, text, tier and XP. Posts of accounts outside the team (fixtures) drop.
export function postRows({ team, posts = [], observations = [], versions = [], cards = [], events = [], installs = [], links = [] }, now = Date.now()) {
  const accounts = new Map(team.accounts.map((a) => [a.id, a]));
  // The link reply's newest view count, and the newest App Store download count of each link code (Nam, 2026-11-09).
  // Apple lists a link code only from 5 downloads up, so a code it never listed has no count, not zero.
  const newest = (list, keyOf) => { const out = new Map(); for (const x of list) { const k = keyOf(x); const had = out.get(k);
    if (Date.parse(x.captured_at) <= now && (!had || x.captured_at > had.captured_at)) out.set(k, x); } return out; };
  const linkViews = newest(links, (x) => x.post_id);
  const storeOf = newest(installs, (x) => x.ct);
  // Apple's newest read. A link code it does not list in that read had fewer than 5 downloads, once Apple has counted
  // the post's first 2 days.
  const appleRead = installs.reduce((m, x) => (Date.parse(x.captured_at) <= now && x.captured_at > m ? x.captured_at : m), '');
  const underFive = (p) => Boolean(p.ct && appleRead && !storeOf.has(p.ct) && Date.parse(p.published_at) + 2 * 864e5 <= Date.parse(appleRead));
  const members = new Map(team.members.map((m) => [m.id, m]));
  const latest = latestReadings(observations, now);
  const text = new Map();
  for (const v of versions) {
    const had = text.get(v.post_id);
    if (Date.parse(v.captured_at) <= now && (!had || v.captured_at > had.captured_at)) text.set(v.post_id, v);
  }
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  const edited = new Set(events.filter((e) => e.type === 'edited' && e.assignment_id).map((e) => e.assignment_id));
  const rows = posts.filter((p) => Date.parse(p.published_at) <= now && members.has(accounts.get(p.account_id)?.member_id))
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at))
    .map((p) => {
      const account = accounts.get(p.account_id);
      const o = latest.get(p.id) ?? null;
      const card = cardOf.get(p.card_id) ?? null;
      const v = text.get(p.id);
      const day = vnDate(new Date(p.published_at));
      return { ...p, account, member: members.get(account.member_id), day, week: mondayOf(day), reading: o,
        views: o?.views ?? null, likes: o?.likes ?? null, replies: o?.other_replies ?? o?.replies ?? null,
        reposts: o?.reposts ?? null, quotes: o?.quotes ?? null, themes: (o?.reply_themes ?? []).filter((t) => t.kind !== 'seller'),
        op: v?.op || card?.op || '', r1: v?.r1 ?? card?.r1 ?? '', r2: v?.r2 ?? '', r2Views: linkViews.get(p.id)?.r2_views ?? null,
        dl: p.ct ? storeOf.get(p.ct)?.installs ?? null : null, dlUnder5: underFive(p), card, edited: edited.has(p.assignment_id), link: hasAppLink(v),
        // Her own post: on a creative account, or with no card. The read stores a post made with a Tạo link cho bài mới
        // link as match_method 'ct' with no card, and one it could not place as 'creative'; both are hers, not a card's.
        creative: account.kind === 'creative' || p.card_id == null };
    });
  // Each post's normal comes only from posts published before it, so a later hit never changes an earlier win.
  rows.forEach((row, i) => {
    const earlier = rows.slice(0, i).filter((r) => r.views != null);
    const own = earlier.filter((r) => r.account_id === row.account_id).slice(-NORMAL_POSTS);
    const base = own.length >= 3 ? own : earlier.slice(-NORMAL_POSTS);
    const normal = base.length ? Math.max(NORMAL_FLOOR, median(base.map((r) => r.views))) : null;
    const views = row.views ?? 0;
    const beat = normal != null && views >= BEAT * normal;
    const tier = views >= MEGA ? 'mega' : views >= HIT ? 'hit' : beat ? 'beat' : null;
    const parts = [['post', XP.post]];
    if (beat) parts.push(['beat', XP.beat]);
    if (views >= HIT) parts.push(['hit', XP.hit]);
    if (views >= MEGA) parts.push(['mega', XP.mega]);
    Object.assign(row, { normal, beat, tier, xpParts: parts, xp: parts.reduce((s, [, x]) => s + x, 0) });
  });
  return rows;
}

const daysOf = (rows) => [...new Set(rows.map((r) => r.day))].sort();

// A streak is the run of days in a row with a post. It stays alive through today until midnight: a member who posted
// yesterday and not yet today still holds it, at risk.
export function streak(days, today) {
  const set = new Set(days);
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of [...set].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const end = set.has(today) ? today : set.has(addDays(today, -1)) ? addDays(today, -1) : null;
  let current = 0;
  for (let d = end; d && set.has(d); d = addDays(d, -1)) current++;
  return { current, longest, today: set.has(today), atRisk: current > 0 && !set.has(today) };
}

// XP of a set of posts: each post's XP plus the day XP for each day with a post.
export const xpOf = (rows) => rows.reduce((s, r) => s + r.xp, 0) + daysOf(rows).length * XP.day;

const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);

/* ---------- Periods: a week, a month or a quarter (Nam, 2026-11-03) ---------- */

const pad = (x) => String(x).padStart(2, '0');
const lastOfMonth = (y, m) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
// The period of a kind that holds the day: from and to are its first and last days.
export function periodOf(kind, day) {
  if (kind === 'week') { const from = mondayOf(day); return { kind, from, to: addDays(from, 6) }; }
  const [y, m] = day.split('-').map(Number);
  if (kind === 'month') return { kind, from: `${y}-${pad(m)}-01`, to: lastOfMonth(y, m) };
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  return { kind: 'quarter', from: `${y}-${pad(q)}-01`, to: lastOfMonth(y, q + 2) };
}
export const prevPeriod = (p) => periodOf(p.kind, addDays(p.from, -1));
export const nextPeriod = (p) => periodOf(p.kind, addDays(p.to, 1));
const asPeriod = (p) => typeof p === 'string' ? periodOf('week', p) : p;
const inside = (p) => (r) => r.day >= p.from && r.day <= p.to;
export const periodDays = (p) => { const out = []; for (let d = p.from; d <= p.to; d = addDays(d, 1)) out.push(d); return out; };

// The period's table: every member, ranked by XP, then views. move is places gained since the period before (null if
// new). With quests, each day she met her target adds quest XP and each post over it extra XP. A week string still works
// for a week.
export function weekTable(rows, members, period, quests = null) {
  const p0 = asPeriod(period);
  const rank = (p) => members.map((m) => {
    const mine = rows.filter((r) => r.member.id === m.id && inside(p)(r));
    const met = quests ? quests.metIn(m.id, p.from, p.to) : 0;
    const extra = quests ? quests.extraIn(m.id, p.from, p.to) : 0;
    return { member: m, rows: mine, xp: xpOf(mine) + met * XP.quest + extra * XP.extra, met, extra, posts: mine.length, days: daysOf(mine).length,
      views: sum(mine, 'views'), hits: mine.filter((r) => r.views >= HIT).length };
  }).sort((a, b) => b.xp - a.xp || b.views - a.views || a.member.name.localeCompare(b.member.name));
  const now = rank(p0);
  const before = rank(prevPeriod(p0));
  const playedBefore = new Set(before.filter((x) => x.posts).map((x) => x.member.id));
  return now.map((x, i) => {
    const was = before.findIndex((y) => y.member.id === x.member.id);
    return { ...x, place: i + 1, move: playedBefore.has(x.member.id) && x.posts ? was - i : null };
  });
}

// The weeks with posts, newest first, always with the current week.
export const weekList = (rows, today) => [...new Set([mondayOf(today), ...rows.map((r) => r.week)])].sort().reverse();

// The period's crowns. A crown of the running period is a lead, not a win, so done says which.
export function crowns(rows, members, period, today, quests = null) {
  const p = asPeriod(period);
  const table = weekTable(rows, members, p, quests);
  const best = [...rows.filter(inside(p))].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] ?? null;
  const leader = table[0]?.xp ? table[0] : null;
  const last = p.to < today ? p.to : today;
  const runs = members.map((m) => {
    const days = daysOf(rows.filter((r) => r.member.id === m.id && r.day <= last));
    const s = streak(days, last);
    return { member: m, days: s.current };
  }).sort((a, b) => b.days - a.days);
  const streakTop = runs[0]?.days >= 2 ? runs[0] : null;
  const climber = [...table].filter((x) => x.move > 0).sort((a, b) => b.move - a.move || a.place - b.place)[0] ?? null;
  return { done: p.to < today, best, leader, streak: streakTop, climber, table };
}

// The team's period: views, posts against the members' targets (for the whole period, and due up to today), posts the
// read has not confirmed yet, hits and the team streak. A week string still works for a week.
export function teamWeek(rows, members, period, today, quests) {
  const p = asPeriod(period);
  const inWeek = rows.filter(inside(p));
  const prev = rows.filter(inside(prevPeriod(p)));
  const current = p.from <= today && today <= p.to;
  const days = periodDays(p);
  let target = 0, due = 0, done = 0;
  for (const m of members) for (const d of days) {
    const q = quests.day(m.id, d);
    if (q.status === 'before') continue;
    const want = q.target.seeding + q.target.creative;
    target += want;
    if (d <= today) { due += want; done += q.seeding + q.creative; }
  }
  return { views: sum(inWeek, 'views'), prevViews: sum(prev, 'views'), posts: done, confirmed: inWeek.length, target, due,
    hits: inWeek.filter((r) => r.views >= HIT).length, streak: streak(daysOf(rows), today), current };
}

/* ---------- Daily targets (Nam, 2026-11-03) ---------- */

// A slot still holding its setup name (thaiha.2) is no account on Threads yet.
export const isPlaceholder = (handle) => /^[a-z]+\.(1|2|creative)$/.test(handle);
const liveSeeding = (accounts, memberId) => accounts.filter((a) => a.member_id === memberId && a.kind === 'card'
  && a.active !== false && !isPlaceholder(a.handle)).length;

// Monday is 0, Sunday 6, the order of a target's plan.
export const weekdayIndex = (day) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

// The plan in force on a day: the newest row a manager set that starts on or before it. A plan holds 7 seeding and 7
// creative counts, Monday first, and repeats each week (Nam, 2026-11-03: "Monday could have a KPI of one seeding, one
// creative, but Tuesday can have like two seeding, one creative"). A day before a member's first plan uses the plan of
// that first day, so a plan set on a Wednesday also judges that week's Monday (Nam, 2026-11-04); a later change still
// starts on the day a manager saves it. With no row at all, one seeding post a day per live seeding account and no
// creative post, the rule Kho bài already shows.
export function planOn(targets, accounts, memberId, day) {
  const mine = targets.filter((t) => t.member_id === memberId)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || String(a.created_at).localeCompare(String(b.created_at)));
  const row = mine.filter((t) => t.starts_on <= day).at(-1) ?? mine.filter((t) => t.starts_on === mine[0]?.starts_on).at(-1);
  if (row) return { seeding: row.seeding.map(Number), creative: row.creative.map(Number), set: true, by: row.set_by ?? null, at: row.created_at ?? null };
  const n = liveSeeding(accounts, memberId);
  return { seeding: Array(7).fill(n), creative: Array(7).fill(0), set: false };
}

// The target of one day out of the plan.
export function targetOn(targets, accounts, memberId, day) {
  const plan = planOn(targets, accounts, memberId, day);
  const i = weekdayIndex(day);
  const out = { seeding: plan.seeding[i], creative: plan.creative[i], set: plan.set };
  return plan.set ? { ...out, by: plan.by, at: plan.at } : out;
}

// What the morning read has not confirmed yet, for 2 days: a card post she marked as posted (seeding) and a link she
// made for a post of her own (creative). Older, it is either confirmed or missing.
export function pendingWork({ events = [], posts = [] }, now) {
  const found = new Set(posts.map((p) => p.assignment_id).filter(Boolean));
  const cts = new Set(posts.map((p) => p.ct).filter(Boolean));
  const fresh = (e) => Date.parse(e.at) <= now && now - Date.parse(e.at) < 2 * DAY;
  const last = new Map();
  for (const e of [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (['posted', 'posted_undo'].includes(e.type) && e.assignment_id) last.set(e.assignment_id, e);
  }
  const out = [];
  for (const [id, e] of last) {
    if (e.type === 'posted' && !found.has(id) && fresh(e)) out.push({ kind: 'seeding', member_id: e.member_id, day: vnDate(new Date(e.at)), at: e.at, assignment_id: id, account_id: e.account_id ?? null });
  }
  for (const e of events) {
    if (e.type === 'creative_link' && e.payload?.ct && !cts.has(e.payload.ct) && fresh(e)) out.push({ kind: 'creative', member_id: e.member_id, day: vnDate(new Date(e.at)), at: e.at, ct: e.payload.ct });
  }
  return out;
}

// Each member's days against her target. A day is met when both counts reach the target; a zero target is a rest day,
// which never breaks the quest streak; a day before her first account is before. Today stays open until she meets it.
// short is what the day still lacks of each kind. extra counts the posts over the target, only on a met or rest day, so
// three seeding posts never stand in for a missing creative one.
export function makeQuests({ rows, pending = [], targets = [], accounts, today }) {
  const joined = new Map();
  for (const a of accounts) {
    const d = a.created_at ? vnDate(new Date(a.created_at)) : '0000-00-00';
    if (!joined.has(a.member_id) || d < joined.get(a.member_id)) joined.set(a.member_id, d);
  }
  const memo = new Map();
  function day(memberId, d) {
    const key = `${memberId}|${d}`;
    if (memo.has(key)) return memo.get(key);
    const posts = rows.filter((r) => r.member.id === memberId && r.day === d);
    const wait = pending.filter((p) => p.member_id === memberId && p.day === d);
    const seeding = posts.filter((r) => !r.creative).length + wait.filter((w) => w.kind === 'seeding').length;
    const creative = posts.filter((r) => r.creative).length + wait.filter((w) => w.kind === 'creative').length;
    const target = targetOn(targets, accounts, memberId, d);
    const met = target.seeding + target.creative > 0 && seeding >= target.seeding && creative >= target.creative;
    const status = d > today ? 'future' : d < (joined.get(memberId) ?? '9999') ? 'before'
      : target.seeding + target.creative === 0 ? 'rest' : met ? 'met' : d === today ? 'open' : 'missed';
    const short = { seeding: Math.max(0, target.seeding - seeding), creative: Math.max(0, target.creative - creative) };
    const extra = ['met', 'rest'].includes(status) ? Math.max(0, seeding - target.seeding) + Math.max(0, creative - target.creative) : 0;
    const out = { day: d, posts, wait, seeding, creative, target, status, short, extra };
    memo.set(key, out);
    return out;
  }
  const week = (memberId, monday) => Array.from({ length: 7 }, (_, i) => day(memberId, addDays(monday, i)));
  // Walks from her first account's day at the earliest, so an open start such as '0000-00-00' walks only real days.
  function sumIn(memberId, from, to, of) {
    const start = joined.get(memberId) ?? today;
    let n = 0;
    for (let d = from > start ? from : start; d <= to && d <= today; d = addDays(d, 1)) n += of(day(memberId, d));
    return n;
  }
  const metIn = (memberId, from, to) => sumIn(memberId, from, to, (q) => q.status === 'met' ? 1 : 0);
  const extraIn = (memberId, from, to) => sumIn(memberId, from, to, (q) => q.extra);
  // Days met in a row, back from today; today counts once met, a rest day is skipped.
  function questStreak(memberId) {
    let n = 0;
    let d = day(memberId, today).status === 'met' ? today : addDays(today, -1);
    for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
      const s = day(memberId, d).status;
      if (s === 'met') n++;
      else if (s !== 'rest') break;
    }
    return n;
  }
  return { day, week, metIn, extraIn, streak: questStreak, today };
}

// One kind's posts: kind 'all', 'seeding' or 'creative' (Nam, 2026-11-04: watch seeding and creative apart).
export const ofKind = (rows, kind) => !kind || kind === 'all' ? rows : rows.filter((r) => r.creative === (kind === 'creative'));

// The quests seen through one kind: the other kind's target, posts and waits drop out, so a day is met when this kind
// is, a day that asks nothing of this kind is a rest day, and the pace, the ticks and the chain follow this kind alone.
export function questsOf(quests, kind) {
  if (!kind || kind === 'all') return quests;
  const other = kind === 'seeding' ? 'creative' : 'seeding';
  const memo = new Map();
  function day(memberId, d) {
    const key = `${memberId}|${d}`;
    if (memo.has(key)) return memo.get(key);
    const q = quests.day(memberId, d);
    const target = { ...q.target, [other]: 0 };
    const got = q[kind];
    const status = ['before', 'future'].includes(q.status) ? q.status : !target[kind] ? 'rest'
      : got >= target[kind] ? 'met' : d === quests.today ? 'open' : 'missed';
    const out = { ...q, target, [other]: 0, status, posts: ofKind(q.posts, kind), wait: q.wait.filter((w) => w.kind === kind),
      short: { ...q.short, [other]: 0 }, extra: ['met', 'rest'].includes(status) ? Math.max(0, got - target[kind]) : 0 };
    memo.set(key, out);
    return out;
  }
  const week = (memberId, monday) => Array.from({ length: 7 }, (_, i) => day(memberId, addDays(monday, i)));
  return { ...quests, day, week };
}

/* ---------- The team dashboard ---------- */

// Views, posts and hits for the period and the n − 1 before it, oldest first. A period still running is partial.
export function periodSeries(rows, period, today, n = 8) {
  const list = [asPeriod(period)];
  while (list.length < n) list.unshift(prevPeriod(list[0]));
  return list.map((p) => {
    const inP = rows.filter(inside(p));
    return { ...p, views: sum(inP, 'views'), posts: inP.length, hits: inP.filter((r) => r.views >= HIT).length, partial: p.from <= today && today <= p.to };
  });
}
export const weeklySeries = (rows, today, n = 8) => periodSeries(rows, periodOf('week', today), today, n).map((p) => ({ ...p, week: p.from }));

// Posts from one day to another by their views, in four bands.
export const BANDS = [['Dưới 1 N', 0, 1_000], ['1 – 10 N', 1_000, HIT], ['10 – 100 N', HIT, MEGA], ['Từ 100 N', MEGA, Infinity]];
export function viewBands(rows, from, to) {
  const read = rows.filter((r) => r.day >= from && r.day <= to && r.views != null);
  return { posts: read.length, bands: BANDS.map(([label, lo, hi]) => ({ label, n: read.filter((r) => r.views >= lo && r.views < hi).length })) };
}

// The team's chain as a calendar, Monday first, from the Monday on or before from to the Sunday on or after to. A day is
// on when anyone posted, all when every member with a target met it; a run of days on joins into one band.
export function chain(rows, members, quests, from, to, today) {
  const days = [];
  for (let d = mondayOf(from); d <= addDays(mondayOf(to), 6); d = addDays(d, 1)) {
    const posts = rows.filter((r) => r.day === d).length + members.reduce((s, m) => s + quests.day(m.id, d).wait.length, 0);
    const states = members.map((m) => quests.day(m.id, d).status).filter((s) => !['before', 'rest', 'future'].includes(s));
    const met = states.filter((s) => s === 'met').length;
    days.push({ day: d, posts, met, of: states.length, on: d <= today && posts > 0, all: d <= today && states.length > 0 && met === states.length,
      today: d === today, future: d > today, outside: d < from || d > to });
  }
  return days;
}

// All time: since the first post.
export function teamAllTime(rows) {
  const top = [...rows].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return { since: rows[0]?.day ?? null, posts: rows.length, views: sum(rows, 'views'), hits: rows.filter((r) => r.views >= HIT).length,
    megas: rows.filter((r) => r.views >= MEGA).length, top: top.slice(0, 5), median: median(rows.map((r) => r.views)) };
}

// Views and posts by the day the posts went out, from one day to another, with the seeding and creative split.
export function dailySeries(rows, from, to) {
  return Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1 }, (_, i) => {
    const day = addDays(from, i);
    const posts = rows.filter((r) => r.day === day);
    const best = [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] ?? null;
    return { day, posts: posts.length, seeding: posts.filter((r) => !r.creative).length, creative: posts.filter((r) => r.creative).length,
      views: sum(posts, 'views'), best };
  });
}

// Weeks a member won (most XP) and weeks her post was the week's best, over completed weeks only.
function weekWins(rows, members, today, quests) {
  const wins = new Map(members.map((m) => [m.id, { mvp: 0, best: 0 }]));
  for (const w of weekList(rows, today).filter((w) => w < mondayOf(today))) {
    const c = crowns(rows, members, w, today, quests);
    if (c.leader) wins.get(c.leader.member.id).mvp++;
    if (c.best) wins.get(c.best.member.id).best++;
  }
  return wins;
}

export const BADGES = {
  mega: ['Siêu hit', 'Một bài trên 100 nghìn lượt xem'],
  hit: ['Hit', 'Một bài trên 10 nghìn lượt xem'],
  best: ['Bài của tuần', 'Bài nhiều lượt xem nhất trong tuần'],
  mvp: ['Dẫn đầu tuần', 'Nhiều XP nhất trong tuần'],
  streak7: ['Chuỗi 7 ngày', 'Đăng 7 ngày liền'],
  streak14: ['Chuỗi 14 ngày', 'Đăng 14 ngày liền'],
  full: ['Tuần trọn vẹn', 'Đăng bài đủ 7 ngày trong tuần'],
};

// Each member's profile numbers. rank is her place in the current week.
export function profiles(rows, members, today, quests = null) {
  const wins = weekWins(rows, members, today, quests);
  const table = weekTable(rows, members, mondayOf(today), quests);
  const teamMedian = median(rows.map((r) => r.views));
  const teamHitRate = rows.length ? rows.filter((r) => r.views >= HIT).length / rows.length : 0;
  return new Map(members.map((m) => {
    const mine = rows.filter((r) => r.member.id === m.id);
    const days = daysOf(mine);
    const s = streak(days, today);
    const met = quests ? quests.metIn(m.id, '0000-00-00', today) : 0;
    const extra = quests ? quests.extraIn(m.id, '0000-00-00', today) : 0;
    const xp = xpOf(mine) + met * XP.quest + extra * XP.extra;
    const fullWeeks = [...new Set(mine.map((r) => r.week))].filter((w) => w < mondayOf(today)
      && Array.from({ length: 7 }, (_, i) => addDays(w, i)).every((d) => days.includes(d))).length;
    const w = wins.get(m.id);
    const badges = [
      ['mega', mine.filter((r) => r.views >= MEGA).length], ['hit', mine.filter((r) => r.views >= HIT).length],
      ['best', w.best], ['mvp', w.mvp], ['streak14', s.longest >= 14 ? 1 : 0], ['streak7', s.longest >= 7 ? 1 : 0], ['full', fullWeeks],
    ].filter(([, n]) => n > 0).map(([key, n]) => ({ key, n, label: BADGES[key][0], hint: BADGES[key][1] }));
    const top = [...mine].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const place = table.find((x) => x.member.id === m.id);
    return [m.id, { member: m, rows: mine, xp, level: level(xp), streak: s, days: days.length, first: days[0] ?? null,
      last: days.at(-1) ?? null, views: sum(mine, 'views'), median: median(mine.map((r) => r.views)), teamMedian,
      hitRate: mine.length ? mine.filter((r) => r.views >= HIT).length / mine.length : 0, teamHitRate,
      top: top.slice(0, 3), badges, week: place, met, extra, quest: quests ? quests.streak(m.id) : 0, facts: facts(mine, rows) }];
  }));
}

const fmt = (v) => new Intl.NumberFormat('vi-VN').format(Math.round(v));
const SLOTS = [['sáng sớm', 5, 9], ['buổi sáng', 9, 12], ['buổi trưa', 12, 15], ['buổi chiều', 15, 19], ['buổi tối', 19, 23], ['đêm khuya', 23, 29]];
const vnHour = (iso) => (new Date(iso).getUTCHours() + 7) % 24;
const slotOf = (h) => SLOTS.find(([, from, to]) => (h < 5 ? h + 24 : h) >= from && (h < 5 ? h + 24 : h) < to)[0];

// What Studio can read off her posts. Each fact needs enough posts behind it, or it stays out.
export function facts(mine, all) {
  const out = [];
  const read = mine.filter((r) => r.views != null);
  const bySlot = new Map();
  for (const r of read) { const s = slotOf(vnHour(r.published_at)); bySlot.set(s, [...(bySlot.get(s) ?? []), r.views]); }
  const slots = [...bySlot].filter(([, v]) => v.length >= 3).map(([s, v]) => ({ s, n: v.length, m: median(v) })).sort((a, b) => b.m - a.m);
  if (slots.length >= 2) out.push({ key: 'slot', title: `Đăng ${slots[0].s} được nhiều lượt xem nhất`,
    detail: `Trung vị ${fmt(slots[0].m)} lượt xem qua ${slots[0].n} bài, so với ${fmt(slots.at(-1).m)} khi đăng ${slots.at(-1).s}.`, a: slots[0].m, b: slots.at(-1).m });
  const byAccount = new Map();
  // A switched-off account (a disabled or throttled one) is no advice, so it stays out.
  for (const r of read.filter((x) => x.account.active !== false)) byAccount.set(r.account.handle, [...(byAccount.get(r.account.handle) ?? []), r.views]);
  const accs = [...byAccount].filter(([, v]) => v.length >= 3).map(([h, v]) => ({ h, n: v.length, m: median(v) })).sort((a, b) => b.m - a.m);
  if (accs.length >= 2) out.push({ key: 'account', title: `@${accs[0].h} là tài khoản mạnh nhất`,
    detail: `Trung vị ${fmt(accs[0].m)} lượt xem qua ${accs[0].n} bài; @${accs.at(-1).h} đạt ${fmt(accs.at(-1).m)}.`, a: accs[0].m, b: accs.at(-1).m });
  const cardPosts = mine.filter((r) => r.assignment_id);
  if (cardPosts.length >= 5) {
    const e = cardPosts.filter((r) => r.edited);
    const plain = cardPosts.filter((r) => !r.edited);
    const em = median(e.map((r) => r.views));
    const pm = median(plain.map((r) => r.views));
    const share = Math.round((e.length / cardPosts.length) * 100);
    out.push({ key: 'edits', title: `Sửa ${share}% bài trước khi đăng`,
      detail: e.length >= 3 && plain.length >= 3 ? `Bài đã sửa: trung vị ${fmt(em)} lượt xem. Bài giữ nguyên: ${fmt(pm)}.` : `${e.length} trên ${cardPosts.length} bài lấy từ kho đã được sửa.` });
  }
  const themes = new Map();
  for (const r of mine) for (const t of r.themes) themes.set(t.theme, (themes.get(t.theme) ?? 0) + (t.count ?? 1));
  const said = [...themes].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (said.length) out.push({ key: 'themes', title: 'Người đọc hay nhắc đến', list: said.map(([theme, n]) => ({ theme, n })) });
  if (read.length >= 5) {
    const mine50 = median(read.map((r) => r.views));
    const team50 = median(all.map((r) => r.views));
    if (team50) out.push({ key: 'vs', title: mine50 >= team50 ? 'Bài của bạn có lượt xem cao hơn mức chung' : 'Bài của bạn có lượt xem thấp hơn mức chung',
      detail: `Trung vị ${fmt(mine50)} lượt xem một bài; mức chung là ${fmt(team50)}.`, a: mine50, b: team50 });
  }
  return out;
}

// What a manager should look at today: streaks at risk, members quiet for days, posts she marked as posted that the
// daily read has not found, and seeding accounts with no post for days.
export function alerts({ rows, team, activity = { assignments: [], events: [], posts: [] }, today, now = Date.now() }) {
  const out = [];
  for (const m of team.members) {
    const mine = rows.filter((r) => r.member.id === m.id);
    const days = daysOf(mine);
    const s = streak(days, today);
    if (s.atRisk && s.current >= 3) out.push({ kind: 'streak', member: m, n: s.current, text: `Chuỗi ${s.current} ngày sẽ mất nếu hôm nay không đăng bài.` });
    const last = days.at(-1);
    const quiet = last ? Math.round((Date.parse(today) - Date.parse(last)) / DAY) : null;
    if (quiet != null && quiet >= 3) out.push({ kind: 'quiet', member: m, n: quiet, text: `${quiet} ngày chưa có bài mới. Bài gần nhất ${last.slice(8)}/${+last.slice(5, 7)}.` });
  }
  const found = new Set(activity.posts.map((p) => p.assignment_id));
  const lastMark = new Map();
  for (const e of activity.events) if (['posted', 'posted_undo'].includes(e.type) && e.assignment_id) lastMark.set(e.assignment_id, e);
  for (const [id, e] of lastMark) {
    if (e.type !== 'posted' || found.has(id) || now - Date.parse(e.at) < 1.5 * DAY) continue;
    const m = team.members.find((x) => x.id === e.member_id);
    if (!m) continue;
    const hours = Math.round((now - Date.parse(e.at)) / 3_600_000);
    out.push({ kind: 'missing', member: m, n: hours, text: `Đã bấm đăng ${Math.round(hours / 24)} ngày trước, nhưng hệ thống chưa tìm thấy bài trên Threads.` });
  }
  // A quiet account of a member who is quiet herself says nothing new, so only her other quiet accounts show.
  const quietMembers = new Set(out.filter((a) => a.kind === 'quiet').map((a) => a.member.id));
  for (const a of team.accounts.filter((x) => x.kind === 'card' && x.active !== false && !quietMembers.has(x.member_id))) {
    const m = team.members.find((x) => x.id === a.member_id);
    const mine = rows.filter((r) => r.account_id === a.id);
    const last = mine.at(-1)?.day ?? null;
    const quiet = last ? Math.round((Date.parse(today) - Date.parse(last)) / DAY) : null;
    if (m && quiet != null && quiet >= 5) out.push({ kind: 'account', member: m, n: quiet, text: `@${a.handle} ${quiet} ngày chưa có bài.` });
  }
  const order = { missing: 0, streak: 1, quiet: 2, account: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || b.n - a.n);
}

// One posting grid per member: the last n days, each with its post count and views.
export function calendar(rows, today, n = 42) {
  const end = addDays(mondayOf(today), 6);
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(end, i - n + 1);
    const posts = rows.filter((r) => r.day === day);
    return { day, future: day > today, posts: posts.length, views: sum(posts, 'views') };
  });
}
