import { wordDiff } from './diff.js';

// The feedback chat (docs/plans/2026-10-12-feedback-chat-v3.md): which changes a member has not explained yet,
// how they split into spans for the bot, the team ratio, and the answer rows a chat saves after each bot turn.

const DAY = 86400000;
export const LIST_DAYS = 14;
export const RATIO_DAYS = 28;
const MAX_SPANS = 3;
const WHOLE_SHARE = 0.6;
// Unchanged words between two edits that still read as one edit.
const JOIN_WORDS = 2;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

// Edits too small to learn from (CIPHER's edit threshold): only punctuation, spacing or letter case changed, or a short
// span differs by one or two letters, which is a typo. The bot never asks about these.
const bare = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s\p{P}]/gu, '');
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = next;
    }
  }
  return row[b.length];
}
export function minorChange(before, after) {
  const [a, b] = [bare(before), bare(after)];
  if (a === b) return true;
  return words(before) <= 2 && words(after) <= 2 && Math.max(a.length, b.length) <= 12 && distance([...a], [...b]) <= 2;
}

// The changed stretches of one part. A part rewritten past WHOLE_SHARE, or with more than MAX_SPANS
// stretches, is one whole change, so the bot asks about the post as a whole.
export function changeSpans(before, after) {
  const ops = wordDiff(before, after);
  const changed = ops.filter((o) => o.type !== 'same').reduce((n, o) => n + o.text.trim().length, 0);
  const total = String(before).trim().length + String(after).trim().length;
  if (!changed) return [];
  const spans = [];
  let open = null;
  let gap = null;
  for (const o of ops) {
    if (o.type === 'same') {
      if (open) gap = gap ? { b: gap.b + o.text, a: gap.a + o.text } : { b: o.text, a: o.text };
      continue;
    }
    if (open && gap && words(gap.b) <= JOIN_WORDS) { open.before += gap.b; open.after += gap.a; }
    else if (open && gap) { spans.push(open); open = null; }
    gap = null;
    open ??= { before: '', after: '' };
    if (o.type === 'del') open.before += o.text; else open.after += o.text;
  }
  if (open) spans.push(open);
  const clean = spans.map((s) => ({ whole: false, before: s.before.trim(), after: s.after.trim() }));
  if (clean.length > MAX_SPANS || changed / total > WHOLE_SHARE) return [{ whole: true, before: String(before).trim(), after: String(after).trim() }];
  return clean;
}

const lastEdits = (events, memberId) => {
  const last = new Map();
  for (const e of events) {
    if (e.type !== 'edited' || e.member_id !== memberId || !e.assignment_id || !e.payload?.part) continue;
    if (e.payload.before === e.payload.after) continue;
    const key = `${e.assignment_id}.${e.payload.part}`;
    if (!last.has(key) || Date.parse(e.at) >= Date.parse(last.get(key).at)) last.set(key, e);
  }
  return last;
};

// An edit is explained by any answer about the same card part given after it, from the old form or the chat.
function explainedEdit(edit, events) {
  return events.some((e) => e.type === 'answered' && e.assignment_id === edit.assignment_id
    && ['edit', 'chat'].includes(e.payload?.kind) && e.payload.part === edit.payload.part
    && (e.payload.edit_client_id === edit.client_id || Date.parse(e.at) >= Date.parse(edit.at)));
}
const answeredQuestions = (events) => new Set(events.filter((e) => e.type === 'answered' && e.payload?.question_id).map((e) => e.payload.question_id));
const closedQuestions = (events) => new Set(events.filter((e) => ['answered', 'question_dismissed'].includes(e.type)).map((e) => e.payload?.question_id).filter(Boolean));

// One entry per card with something unexplained from the last LIST_DAYS days: her own edits in Studio and
// the changes the daily read found in Threads after she copied. Newest card first.
//   entry { assignment_id, card_id, at, changes: [{ id, part, whole, before, after, part_before, part_after, minor, source,
//     edit_client_id?, question_id? }] }
export function pendingCards({ events, questions, memberId, now = Date.now(), days = LIST_DAYS }) {
  const since = now - days * DAY;
  const byCard = new Map();
  const entry = (assignmentId, cardId, at) => {
    if (!byCard.has(assignmentId)) byCard.set(assignmentId, { assignment_id: assignmentId, card_id: cardId, at, changes: [] });
    const it = byCard.get(assignmentId);
    if (Date.parse(at) > Date.parse(it.at)) it.at = at;
    return it;
  };
  for (const edit of lastEdits(events, memberId).values()) {
    if (Date.parse(edit.at) < since || explainedEdit(edit, events)) continue;
    const it = entry(edit.assignment_id, edit.card_id, edit.at);
    changeSpans(edit.payload.before, edit.payload.after).forEach((s, i) => it.changes.push({
      id: `s-${edit.payload.part}-${i}`, part: edit.payload.part, ...s, part_before: edit.payload.before, part_after: edit.payload.after,
      minor: minorChange(s.before, s.after), source: 'portal', edit_client_id: edit.client_id,
    }));
  }
  const closed = closedQuestions(events);
  for (const q of questions) {
    if (q.member_id !== memberId || closed.has(q.id) || Date.parse(q.created_at) < since || !q.assignment_id) continue;
    const it = entry(q.assignment_id, q.assignment?.card_id ?? null, q.created_at);
    changeSpans(q.before_text, q.after_text).forEach((s, i) => it.changes.push({
      id: `t-${q.part}-${i}`, part: q.part, ...s, part_before: q.before_text, part_after: q.after_text,
      minor: minorChange(s.before, s.after), source: 'posted', question_id: q.id, guess: q.guess ?? null,
    }));
  }
  return [...byCard.values()].filter((it) => it.changes.length).sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

// Per member over the last RATIO_DAYS days: card parts she changed, and how many of those carry a reason.
// A dismissed daily-read question counts as changed, not explained.
export function feedbackRatio({ events, questions, members, now = Date.now(), days = RATIO_DAYS }) {
  const since = now - days * DAY;
  const answered = answeredQuestions(events);
  return members.map((m) => {
    const edits = [...lastEdits(events, m.id).values()].filter((e) => Date.parse(e.at) >= since);
    const asked = questions.filter((q) => q.member_id === m.id && Date.parse(q.created_at) >= since);
    return {
      member: m,
      changed: edits.length + asked.length,
      explained: edits.filter((e) => explainedEdit(e, events)).length + asked.filter((q) => answered.has(q.id)).length,
    };
  });
}

// What the phone sends the bot for each change. The bot never sees the event ids.
export const wireChanges = (entry) => entry.changes.map((c) => ({
  id: c.id, part: c.part, whole: c.whole, before: c.before, after: c.after, part_before: c.part_before ?? c.before,
  part_after: c.part_after ?? c.after, where: c.source === 'posted' ? 'threads' : 'studio', minor: c.minor === true,
}));

// Her messages in a chat: the words she typed and the suggestions she tapped. A tapped suggestion is the bot's
// wording, so the row keeps the two apart.
export function memberWords(turns) {
  const typed = [];
  const tapped = [];
  for (const t of turns) {
    if (t.role !== 'member' || typeof t.text !== 'string') continue;
    (t.via === 'tap' ? tapped : typed).push(t.text);
  }
  return { typed: typed.join(' / '), tapped, said: typed.length ? 'typed' : tapped.length ? 'tapped' : 'none' };
}

const NEXT = { always: 'always', this_post: 'this_post', unsure: 'unsure' };
const TOOK = { yes: true, no: false };
const BLANK = { type: 'rewrite', verdict: 'unsure', layer: 'none', reason_code: 'other', cue_words: '', lesson: '', scope: 'unsure', history: 'none', took_reading: 'none' };

// The answered rows a chat saves after each bot turn, one per change. Each save repeats the rows with the newer state,
// so readers keep the newest row per chat and change (latestChatRows). The first row carries the chat so far.
// `confirmed` is true only after she tapped Đúng rồi; `corrections` counts her replies to a summary.
export function chatRows({ entry, notes = [], summary = [], turns, model = null, chatId, final = false, confirmed = null, corrections = 0, writerVersion = null }) {
  // Nothing is saved before she says something, so opening a chat never marks an edit as explained. A chat the bot
  // closes on its first turn (only minor edits) still saves its final rows.
  if (!final && !turns.some((t) => t.role === 'member')) return [];
  const byId = new Map(notes.map((n) => [n.change_id, n]));
  const round = turns.filter((t) => t.role === 'member').length;
  const s = memberWords(turns);
  return entry.changes.map((c, i) => {
    const n = byId.get(c.id) ?? (c.minor ? { ...BLANK, type: 'minor', verdict: 'none', scope: 'none' } : BLANK);
    const line = summary.find((l) => l.change_ids.includes(c.id))?.text ?? n.lesson;
    return {
      kind: 'chat', v: 3, chat_id: chatId, round, final, confirmed: confirmed === true ? true : null, corrections,
      part: c.part, change_id: c.id, whole: c.whole, before: c.before, after: c.after, source: c.source,
      ...(c.question_id ? { question_id: c.question_id } : { edit_client_id: c.edit_client_id }),
      type: n.type, verdict: n.verdict, layer: n.layer, reasons: [n.reason_code], words: s.typed, picked: s.tapped, said: s.said,
      guess_taken: TOOK[n.took_reading] ?? null, cue: n.cue_words, lesson: line ?? '', next_time: NEXT[n.scope] ?? null, history: n.history,
      writer_version: writerVersion, model,
      ...(i === 0 ? { transcript: turns } : {}),
    };
  });
}

// v2 rows (rounds of tap answers) and v3 rows (a conversation) share the field names, so both read the same way.
const isChat = (e) => e.type === 'answered' && e.payload?.kind === 'chat' && (e.payload.v === 2 || e.payload.v === 3);
const newer = (a, b) => (a.id ?? 0) > (b.id ?? 0) || ((a.id ?? 0) === (b.id ?? 0) && String(a.at) > String(b.at));

// Only the newest saved row of each chat change; every other event passes through unchanged and in order.
export function latestChatRows(events) {
  const last = new Map();
  for (const e of events) {
    if (!isChat(e)) continue;
    const key = `${e.payload.chat_id}.${e.payload.change_id}`;
    if (!last.has(key) || newer(e, last.get(key))) last.set(key, e);
  }
  return events.filter((e) => !isChat(e) || last.get(`${e.payload.chat_id}.${e.payload.change_id}`) === e);
}

// Her chats that got at least one answer, newest first, for the Đã kể list: the newest saved state of each.
export function doneChats(events) {
  const chats = new Map();
  for (const e of latestChatRows(events.filter(isChat))) {
    const p = e.payload;
    const it = chats.get(p.chat_id) ?? { chat_id: p.chat_id, assignment_id: e.assignment_id, card_id: e.card_id, at: e.at, final: false, confirmed: null, transcript: [], lessons: [], changes: [] };
    if (String(e.at) > String(it.at)) it.at = e.at;
    if (p.transcript) it.transcript = p.transcript;
    it.final ||= p.final === true;
    it.confirmed ??= p.confirmed ?? null;
    if (p.lesson && !it.lessons.includes(p.lesson)) it.lessons.push(p.lesson);
    if (p.change_id && !it.changes.some((c) => c.id === p.change_id)) {
      it.changes.push({ id: p.change_id, part: p.part, whole: p.whole === true, before: p.before ?? '', after: p.after ?? '', source: p.source });
    }
    chats.set(p.chat_id, it);
  }
  return [...chats.values()].filter((c) => c.transcript.some((t) => t.role === 'member'))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// The v1 rows. Only a v1 chat screen still cached on a phone imports this; remove it after 2026-10-19.
const AGREE = { yes: true, no: false, none: null };
export function chatAnswers({ entry, reply, turns, model, chatId }) {
  const items = new Map(reply.items.map((i) => [i.change_id, i]));
  return entry.changes.map((c, n) => {
    const i = items.get(c.id) ?? { reason_code: 'other', words: '', scope: 'unsure', agreed: 'none' };
    return {
      kind: 'chat', chat_id: chatId, part: c.part, change_id: c.id, whole: c.whole, before: c.before, after: c.after,
      reasons: [i.reason_code], words: i.words, next_time: i.scope, agree: AGREE[i.agreed] ?? null, model,
      ...(c.question_id ? { question_id: c.question_id } : { edit_client_id: c.edit_client_id }),
      ...(n === 0 ? { transcript: [...turns, { role: 'bot', say: reply.say, items: reply.items }] } : {}),
    };
  });
}

// When the bot cannot be reached, one reason form answers for the whole card, in the old payload shapes.
export function formAnswers({ entry, reasons, words, nextTime }) {
  const seen = new Set();
  return entry.changes.filter((c) => {
    const key = c.question_id ?? `${c.part}.${c.edit_client_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((c) => (c.question_id
    ? { kind: 'posted_edit', question_id: c.question_id, part: c.part, reasons, words, next_time: nextTime, agree: null }
    : { kind: 'edit', edit_client_id: c.edit_client_id, part: c.part, reasons, words, next_time: nextTime }));
}
