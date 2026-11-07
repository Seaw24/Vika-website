// Insights (Nam, 2026-11-07; migration intuitions): what members learn while they pick and write posts, in general and
// not about one card. Pure helpers for tags, filters, order and day groups; the page and the composer use them.
import { vnDate, addDays } from './week.js';

// The two default tags. A tag is stored lower case; the label puts back the first capital.
export const DEFAULT_TAGS = [
  { key: 'viết lại', hint: 'Cách viết lại bài cho hay' },
  { key: 'chọn bài', hint: 'Bài, chủ đề nào dễ lan' },
];
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 24;
export const MAX_BODY = 2000;

// Letters and digits only, with no marks, so "#chọnbài", "#chon_bai" and "chọn bài" are the same tag.
export function compact(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// The stored form of a tag she typed: no #, single spaces, lower case, at most 24 characters. Null when nothing is left.
export function normalizeTag(text) {
  const tag = String(text ?? '').replace(/^[#\s]+/, '').replace(/[_\s]+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
  return tag || null;
}
export const tagLabel = (key) => (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');

// A tag she types that matches a known tag by its letters becomes that tag.
export function resolveTag(text, known = []) {
  const tag = normalizeTag(text);
  if (!tag) return null;
  const c = compact(tag);
  return known.find((k) => compact(k) === c) ?? tag;
}

// Every #word in the text becomes a tag and leaves the text. Returns the text and the tags in the order typed.
export function takeHashtags(body, known = []) {
  const tags = [];
  const text = String(body ?? '').replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, (all, lead, word) => {
    const tag = resolveTag(word, known);
    if (tag && !tags.includes(tag)) tags.push(tag);
    return lead;
  });
  return { body: text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim(), tags };
}

// The #word she is typing at the caret, or null.
export function hashAtCaret(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const m = before.match(/(^|\s)#([\p{L}\p{N}_]*)$/u);
  return m ? { word: m[2], start: before.length - m[2].length - 1, end: caret } : null;
}

// Tags she can pick: the defaults first, then the team's tags by how often they are used.
export function tagCounts(list) {
  const counts = new Map(DEFAULT_TAGS.map((t) => [t.key, 0]));
  for (const x of list) for (const t of x.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const defaults = DEFAULT_TAGS.map((t) => t.key);
  return [...counts].map(([key, count]) => ({ key, count, isDefault: defaults.includes(key) }))
    .sort((a, b) => (b.isDefault - a.isDefault) || (a.isDefault ? defaults.indexOf(a.key) - defaults.indexOf(b.key) : b.count - a.count || a.key.localeCompare(b.key, 'vi')));
}

export function suggestTags(word, known) {
  const c = compact(word);
  return known.filter((k) => !c || compact(k).startsWith(c) || compact(k).includes(c)).slice(0, 6);
}

export const PERIODS = [['7', '7 ngày'], ['30', '30 ngày'], ['all', 'Tất cả']];
export const SORTS = [['new', 'Mới nhất'], ['old', 'Cũ nhất'], ['agree', 'Nhiều đồng ý']];

// people and tags are sets; an empty set lets every one through. Both must match. The period counts days in Vietnam.
export function filterList(list, { people = new Set(), tags = new Set(), period = 'all', query = '', today = vnDate() } = {}) {
  const since = period === 'all' ? null : addDays(today, 1 - Number(period));
  const q = compact(query);
  return list.filter((x) => (!people.size || people.has(x.member_id))
    && (!tags.size || (x.tags ?? []).some((t) => tags.has(t)))
    && (!since || vnDate(new Date(x.created_at)) >= since)
    && (!q || compact(x.body).includes(q) || (x.tags ?? []).some((t) => compact(t).includes(q))));
}

export function sortList(list, sort = 'new') {
  const at = (x) => Date.parse(x.created_at);
  const out = [...list];
  if (sort === 'old') return out.sort((a, b) => at(a) - at(b));
  if (sort === 'agree') return out.sort((a, b) => (b.agrees?.length ?? 0) - (a.agrees?.length ?? 0) || at(b) - at(a));
  return out.sort((a, b) => at(b) - at(a));
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export function dayLabel(day, today = vnDate()) {
  if (day === today) return 'Hôm nay';
  if (day === addDays(today, -1)) return 'Hôm qua';
  const [y, m, d] = day.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d}/${m}${day.slice(0, 4) === today.slice(0, 4) ? '' : `/${y}`}`;
}

// Notes in their order, cut into days. The order inside a day follows the list.
export function groupByDay(list, today = vnDate()) {
  const groups = [];
  for (const x of list) {
    const day = vnDate(new Date(x.created_at));
    if (groups.at(-1)?.day !== day) groups.push({ day, label: dayLabel(day, today), items: [] });
    groups.at(-1).items.push(x);
  }
  return groups;
}

const clock = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
// "Vừa xong", "12 phút", "3 giờ" inside 12 hours, then the clock time in Vietnam.
export function timeLabel(iso, now = Date.now()) {
  const mins = Math.floor((now - Date.parse(iso)) / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút`;
  if (mins < 12 * 60) return `${Math.floor(mins / 60)} giờ`;
  return clock.format(new Date(iso));
}

// What one member wrote: her count, her tags by use, and the share of her notes the seat used.
export function personSummary(list, memberId) {
  const mine = list.filter((x) => x.member_id === memberId);
  return { count: mine.length, used: mine.filter((x) => x.outcome === 'used').length,
    agrees: mine.reduce((n, x) => n + (x.agrees?.length ?? 0), 0),
    tags: tagCounts(mine).filter((t) => t.count) };
}

// The seat reads every 2 weeks. The next read is 14 days after the last one, or null before the first.
export function nextReadDay(list) {
  const last = list.map((x) => x.read_at).filter(Boolean).sort().at(-1);
  return last ? addDays(vnDate(new Date(last)), 14) : null;
}
export const unreadCount = (list) => list.filter((x) => !x.read_at).length;

/* ---------- The chat view (2026-11-07, second design) ---------- */

// Nam's note on how Insights works (2026-11-07, live id): it stays at the top of the chat for everyone, in full.
export const GUIDE_ID = '6497e5af-92cf-4cf7-ac30-f52ba45a8134';
export const VIEWS = [['all', 'Cả nhóm'], ['replies', 'Trả lời bạn'], ['top', 'Nổi bật'], ['used', 'Đã dùng'], ['feedback', 'Lý do sửa bài']];
// The notes a scope shows. all and used run oldest first, like a chat; top runs by agrees.
export function scopeList(list, s, today = vnDate()) {
  const base = filterList(list, { ...s, today }).filter((x) => s.view !== 'used' || x.outcome === 'used');
  return s.view === 'top' ? sortList(base.filter((x) => x.agrees?.length), 'agree') : sortList(base, 'old');
}

// Notes of one member within 7 minutes on one day stack under one name, as in a chat.
export function stackMessages(list, gapMinutes = 7) {
  return list.map((x, i) => {
    const prev = list[i - 1];
    const stacked = Boolean(prev && !prev.pending === !x.pending && prev.member_id === x.member_id
      && vnDate(new Date(prev.created_at)) === vnDate(new Date(x.created_at))
      && Date.parse(x.created_at) - Date.parse(prev.created_at) < gapMinutes * 60000);
    return { ...x, stacked };
  });
}

// Each 2-week read as one line in the stream: when it ran and how many notes it read.
export function readMarks(list) {
  const days = new Map();
  for (const x of list) {
    if (!x.read_at) continue;
    const day = vnDate(new Date(x.read_at));
    const d = days.get(day) ?? { day, at: x.read_at, count: 0, used: 0 };
    d.count += 1;
    if (x.outcome === 'used') d.used += 1;
    if (x.read_at < d.at) d.at = x.read_at;
    days.set(day, d);
  }
  return [...days.values()].sort((a, b) => a.at.localeCompare(b.at));
}

// What others wrote since her last visit, in all, per tag and per person.
export function unseenCounts(list, seenAt, meId) {
  const out = { total: 0, byTag: new Map(), byPerson: new Map(), first: null };
  if (!seenAt) return out;
  for (const x of sortList(list, 'old')) {
    if (x.member_id === meId || x.created_at <= seenAt) continue;
    out.total += 1;
    out.first ??= x.id;
    out.byPerson.set(x.member_id, (out.byPerson.get(x.member_id) ?? 0) + 1);
    for (const t of x.tags ?? []) out.byTag.set(t, (out.byTag.get(t) ?? 0) + 1);
  }
  return out;
}

// Links in escaped text become links that open outside Studio.
export const linkify = (html) => html.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"'\]]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

/* ---------- Reactions and replies (2026-11-07, third pass) ---------- */

// The fixed set, in the order the picker shows it. agree is Đồng ý, the signal the seat and Nổi bật read.
export const REACTIONS = [
  { kind: 'agree', emoji: '👍', label: 'Đồng ý' },
  { kind: 'heart', emoji: '❤️', label: 'Thích' },
  { kind: 'fire', emoji: '🔥', label: 'Hay quá' },
  { kind: 'idea', emoji: '💡', label: 'Mở mắt' },
  { kind: 'laugh', emoji: '😂', label: 'Buồn cười' },
  { kind: 'unsure', emoji: '🤔', label: 'Chưa chắc' },
];
// Each kind with its count, whether she chose it and who did, in the set's order; kinds no one chose are left out.
export function reactionSummary(reactions = [], meId) {
  return REACTIONS.map((r) => {
    const who = reactions.filter((x) => x.kind === r.kind).map((x) => x.member_id);
    return { ...r, count: who.length, mine: who.includes(meId), who };
  }).filter((r) => r.count);
}
export const reactionTotal = (x) => x.reactions?.length ?? x.agrees?.length ?? 0;

// Notes and their replies from one read: the notes, and the replies of each note, oldest first.
export function splitThreads(all) {
  const notes = [];
  const replies = new Map();
  for (const x of all) {
    if (!x.parent_id) { notes.push(x); continue; }
    if (!replies.has(x.parent_id)) replies.set(x.parent_id, []);
    replies.get(x.parent_id).push(x);
  }
  for (const list of replies.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const live = new Set(notes.map((x) => x.id));
  for (const id of [...replies.keys()]) if (!live.has(id)) replies.delete(id);
  return { notes, replies };
}

// Replies from others since her last visit: per note, and the notes where they answer her (her note, or a thread
// she replied in).
export function replyNews(notes, replies, seenAt, meId) {
  const byParent = new Map();
  const toMe = new Set();
  if (!seenAt) return { byParent, toMe };
  for (const x of notes) {
    const list = replies.get(x.id) ?? [];
    const fresh = list.filter((r) => r.member_id !== meId && r.created_at > seenAt);
    if (!fresh.length) continue;
    byParent.set(x.id, fresh.length);
    if (x.member_id === meId || list.some((r) => r.member_id === meId)) toMe.add(x.id);
  }
  return { byParent, toMe };
}
// Her threads: notes she wrote or replied in that have replies from others, newest reply first.
export function myThreads(notes, replies, meId) {
  const last = (x) => (replies.get(x.id) ?? []).at(-1)?.created_at ?? '';
  return notes.filter((x) => {
    const list = replies.get(x.id) ?? [];
    return list.some((r) => r.member_id !== meId) && (x.member_id === meId || list.some((r) => r.member_id === meId));
  }).sort((a, b) => last(b).localeCompare(last(a)));
}
