import { wordDiff } from './diff.js';

// The feedback chat (docs/plans/2026-10-12-feedback-chat.md): which changes a member has not explained yet,
// how they split into spans for the bot, the team ratio, and the events a finished chat saves.

const DAY = 86400000;
export const LIST_DAYS = 14;
export const RATIO_DAYS = 28;
const MAX_SPANS = 3;
const WHOLE_SHARE = 0.6;
// Unchanged words between two edits that still read as one edit.
const JOIN_WORDS = 2;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

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
//   entry { assignment_id, card_id, at, changes: [{ id, part, whole, before, after, source, edit_client_id?, question_id? }] }
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
      id: `s-${edit.payload.part}-${i}`, part: edit.payload.part, ...s, source: 'portal', edit_client_id: edit.client_id,
    }));
  }
  const closed = closedQuestions(events);
  for (const q of questions) {
    if (q.member_id !== memberId || closed.has(q.id) || Date.parse(q.created_at) < since || !q.assignment_id) continue;
    const it = entry(q.assignment_id, q.assignment?.card_id ?? null, q.created_at);
    changeSpans(q.before_text, q.after_text).forEach((s, i) => it.changes.push({
      id: `t-${q.part}-${i}`, part: q.part, ...s, source: 'posted', question_id: q.id, guess: q.guess ?? null,
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

const AGREE = { yes: true, no: false, none: null };

// The answered events a finished chat saves: one per change, the first one carrying the chat itself.
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
