// Góp ý's feedback (why members edited a card, cards they did not use, picks they found wrong), read for Insights. Nam
// merged the Góp ý tab into Insights on 2026-11-07: one page for what members learn. The rows are events; this module
// reads them and shapes each into one entry the Insights chat paints under Phản hồi, Lý do sửa bài.
import { loadAnswers, loadAnswerQuestions } from '../data.js?v=20261107a';
import { REASONS, NEXT_TIME, PART_LABEL, labelFor } from '../lib/edits.js';
import { SKIP_REASONS } from '../lib/feedback.js';
import { latestChatRows } from '../lib/chat.js?v=20261107a';

const KINDS = { skip: ['Bài chưa dùng', 'line'], dismiss: ['Không dùng bài này', 'gold'], wrong_pick: ['Góp ý về bài chọn', 'gold'], posted_edit: ['Chỗ sửa khi đăng', 'dark'], edit: ['Chỗ sửa trên portal', ''], chat: ['Kể lý do sửa', 'dark'] };
// A v2 or v3 chat answer (docs/plans/2026-10-12-feedback-chat-v3.md) says whether the draft was wrong and where the problem sits.
const VERDICT = { draft_wrong: ['Bản cũ có vấn đề', 'warn'], taste: ['Chỉ là gu riêng', 'line'], test: ['Sửa thử', 'line'] };
const LAYER = { wording: 'Cách nói', point: 'Chủ đề hoặc ý', style: 'Gu riêng', fact: 'Sai ý', r2: 'Bình luận 2' };
const CONFIRMED = { true: 'Đã xác nhận', amended: 'Đã sửa lại' };

let cache = null;
// One read a minute is enough: feedback lands a few times a day.
export async function loadFeedbackItems(ctx, { fresh = false } = {}) {
  const memberIds = ctx.team.members.map((m) => m.id);
  const key = `${ctx.email}:${[...memberIds].sort().join(',')}`;
  if (!fresh && cache?.key === key && Date.now() - cache.at < 60000) return cache.promise;
  const promise = (async () => {
    const rows = await loadAnswers(memberIds);
    const questionIds = [...new Set(rows.map((r) => r.payload?.question_id).filter(Boolean))];
    const questions = new Map((await loadAnswerQuestions(questionIds)).map((q) => [q.id, q]));
    return shape(rows, questions);
  })();
  cache = { key, at: Date.now(), promise };
  promise.catch(() => { if (cache?.promise === promise) cache = null; });
  return promise;
}

// Each answer, skip or flag becomes { id, at, member_id, title, tone, part, handle, card_id, card_op, text, tags,
// chips, next, diff }. A chat saves its rows after every round; only the newest row of each change shows. Minor
// edits do not, nor a change the bot has no summary for yet.
export function shape(rows, questions = new Map()) {
  const enriched = latestChatRows(rows).filter((row) => !(row.payload?.v >= 2 && (row.payload.type === 'minor' || !String(row.payload.lesson ?? '').trim()))).map((row) => {
    const q = questions.get(row.payload?.question_id);
    return q && row.payload?.kind !== 'chat' ? { ...row, payload: { ...row.payload, guess: q.guess, model: q.model, before: q.before_text, after: q.after_text } } : row;
  });
  const edits = new Map(enriched.filter((r) => r.type === 'edited').map((r) => [r.client_id, r]));
  return enriched.filter((r) => ['answered', 'skipped', 'flagged'].includes(r.type)).map((a) => {
    const p = a.payload ?? {};
    const [title, tone] = KINDS[p.kind] ?? ['Góp ý', ''];
    const edit = edits.get(p.edit_client_id) ?? (p.before != null ? { payload: p } : null);
    const chat = p.v >= 2;
    const [verdict, verdictTone] = VERDICT[p.verdict] ?? [];
    const chips = [
      ...(chat && verdict ? [[verdict, verdictTone]] : []),
      ...(chat && LAYER[p.layer] ? [[LAYER[p.layer], 'line']] : []),
      ...(chat ? [[`${CONFIRMED[String(p.confirmed)] ?? 'Chưa xác nhận'}${p.corrections ? ` · sửa ${p.corrections} lần` : ''}`, p.confirmed === true ? 'dark' : 'line']] : []),
    ];
    const guess = p.guess ? `Máy đoán: ${p.guess}. ${p.agree === true ? 'Thành viên xác nhận đúng.' : 'Thành viên không đồng ý.'}` : '';
    return {
      id: `fb-${a.id}`, at: a.at, member_id: a.member?.id ?? null, kind: p.kind ?? null, title, tone,
      part: PART_LABEL[p.part] ?? null, handle: a.account?.handle ?? null, card_id: a.card_id ?? null, card_op: a.card?.op ?? null,
      text: chat ? String(p.lesson ?? '') : String(p.words ?? '') || guess,
      tags: (p.reasons ?? []).map((r) => labelFor([...REASONS, ...SKIP_REASONS], r)),
      chips,
      next: p.next_time ? labelFor(NEXT_TIME, p.next_time) : null,
      diff: edit?.payload?.before != null ? { before: edit.payload.before, after: edit.payload.after } : null,
    };
  });
}
