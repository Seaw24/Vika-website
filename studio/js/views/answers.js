import { loadAnswers, loadAnswerQuestions } from '../data.js?v=20261027b';
import { REASONS, NEXT_TIME, PART_LABEL, labelFor } from '../lib/edits.js';
import { SKIP_REASONS } from '../lib/feedback.js';
import { esc, firstLine, initial } from '../ui.js?v=20261027b';
import { diffHtml } from './shared.js';
import { latestChatRows } from '../lib/chat.js?v=20261027b';

const when = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const KINDS = { skip: ['Bài chưa dùng', 'line'], dismiss: ['Không dùng bài này', 'gold'], wrong_pick: ['Góp ý về bài chọn', 'gold'], posted_edit: ['Chỗ sửa khi đăng', 'dark'], edit: ['Chỗ sửa trên portal', ''], chat: ['Kể lý do sửa', 'dark'] };
// A v2 or v3 chat answer (docs/plans/2026-10-12-feedback-chat-v3.md) says whether the draft was wrong and where the problem sits.
const VERDICT = { draft_wrong: ['Bản cũ có vấn đề', 'warn'], taste: ['Chỉ là gu riêng', 'line'], test: ['Sửa thử', 'line'] };
const LAYER = { wording: 'Cách nói', point: 'Chủ đề hoặc ý', style: 'Gu riêng', fact: 'Sai ý', r2: 'Bình luận 2' };
let scope = 'all';
let snapshot = null;
let pending = null;
let ownerKey = null;

function fetchFeedback(key, memberIds) {
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    const rows = await loadAnswers(memberIds);
    const questionIds = [...new Set(rows.map((r) => r.payload?.question_id).filter(Boolean))];
    const questions = new Map((await loadAnswerQuestions(questionIds)).map((q) => [q.id, q]));
    const fresh = { key, rows, questions, at: Date.now(), ids: rows.map((r) => r.id).join(',') };
    if (ownerKey === key) snapshot = fresh;
    return fresh;
  })();
  pending = { key, promise };
  const clear = () => { if (pending?.promise === promise) pending = null; };
  promise.then(clear, clear);
  return promise;
}

function entry(a, edit) {
  const p = a.payload ?? {};
  const [title, tone] = KINDS[p.kind] ?? ['Góp ý', ''];
  return `<article class="entry"><i class="av light">${esc(initial(a.member?.name))}</i><div class="panel entry-card">
    <div class="entry-head"><b>${esc(a.member?.name ?? '')}</b><span class="tiny muted">${esc(when.format(new Date(a.at)))}</span></div>
    <div class="tags" style="margin-top:8px"><span class="tag ${tone}">${esc(title)}</span>${p.part ? `<span class="tag line">${esc(PART_LABEL[p.part] ?? '')}</span>` : ''}${a.account ? `<span class="tag line">@${esc(a.account.handle)}</span>` : ''}</div>
    ${a.card?.op ? `<p class="about">Bài: <q>${esc(firstLine(a.card.op, 90))}</q></p>` : ''}
    ${p.v >= 2 ? chatLines(p) : ''}
    ${p.kind === 'chat' && !(p.v >= 2) && p.agree != null ? `<p class="guessline">${p.agree ? 'Đồng ý với điều máy đoán.' : 'Không đồng ý với điều máy đoán.'} <span class="tiny muted">· ${esc(p.model ?? '')}</span></p>` : ''}
    ${p.guess ? `<p class="guessline">Máy đoán: ${esc(p.guess)} <span class="tiny muted">· ${esc(p.model)}</span><br><b style="font-weight:500">${p.agree === true ? 'Thành viên xác nhận đúng.' : 'Thành viên không đồng ý.'}</b></p>` : ''}
    ${p.reasons?.length ? `<div class="tags">${p.reasons.map((r) => `<span class="tag">${esc(labelFor([...REASONS, ...SKIP_REASONS], r))}</span>`).join('')}</div>` : ''}
    ${p.words && !(p.v >= 2) ? `<p class="words">${esc(p.words)}</p>` : ''}
    ${p.next_time ? `<p class="small muted" style="margin-top:10px">Bài sau: <b style="color:var(--ink);font-weight:500">${esc(labelFor(NEXT_TIME, p.next_time))}</b></p>` : ''}
    ${edit ? `<details><summary>Xem chỗ sửa</summary>${diffHtml(edit.payload.before, edit.payload.after)}</details>` : ''}
  </div></article>`;
}

// A chat entry shows the bot's summary of the change, the one she answers Đúng rồi to, never her own messages
// (Nam, 2026-10-23); the transcript keeps those.
function chatLines(p) {
  const [verdict, tone] = VERDICT[p.verdict] ?? [];
  const state = p.confirmed === true ? 'Đã xác nhận' : p.confirmed === 'amended' ? 'Đã sửa lại' : 'Chưa xác nhận';
  const tags = [verdict ? `<span class="tag ${tone}">${esc(verdict)}</span>` : '', LAYER[p.layer] ? `<span class="tag line">${esc(LAYER[p.layer])}</span>` : '',
    `<span class="tag ${p.confirmed === true ? 'dark' : 'line'}">${esc(state)}${p.corrections ? ` · sửa ${p.corrections} lần` : ''}</span>`].join('');
  return `<div class="tags" style="margin-top:8px">${tags}</div>
    <p class="words">${esc(p.lesson)}</p>`;
}

export async function renderAnswers(main, ctx) {
  const memberIds = ctx.team.members.map((m) => m.id);
  const key = `${ctx.email}:${[...memberIds].sort().join(',')}`;
  ownerKey = key;
  const previous = snapshot?.key === key ? snapshot : null;
  const initial = previous ?? await fetchFeedback(key, memberIds);
  let displayed = initial;
  const paint = ({ rows, questions }) => {
    displayed = { rows, questions };
    // A chat saves its rows after every round; only the newest row of each change shows. Minor edits do not, nor a
    // change the bot has no summary for yet.
    const enriched = latestChatRows(rows).filter((row) => !(row.payload?.v >= 2 && (row.payload.type === 'minor' || !String(row.payload.lesson ?? '').trim()))).map((row) => {
      const q = questions.get(row.payload?.question_id);
      // A chat answer already holds the exact span it is about.
      return q && row.payload?.kind !== 'chat' ? { ...row, payload: { ...row.payload, guess: q.guess, model: q.model, before: q.before_text, after: q.after_text } } : row;
    });
    const edits = new Map(enriched.filter((r) => r.type === 'edited').map((r) => [r.client_id, r]));
    const answers = enriched.filter((r) => ['answered', 'skipped', 'flagged'].includes(r.type));
    const shown = scope === 'mine' ? answers.filter((a) => a.member?.name === ctx.me.name) : answers;
    main.innerHTML = `<div class="page-head"><div><p class="eyebrow">Góp ý</p><h1 class="page-title">Cả nhóm nói gì</h1>
        <p class="sub">Lý do sửa bài, bài chưa dùng và bài chọn chưa đúng. Mới nhất trước, ai cũng xem được.</p></div>
      <div class="seg" role="group" aria-label="Lọc góp ý"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">Cả nhóm · ${answers.length}</button><button type="button" data-scope="mine" aria-pressed="${scope === 'mine'}">Của tôi</button></div></div>
      ${shown.length ? `<div class="feed">${shown.map((a) => entry(a, edits.get(a.payload?.edit_client_id) ?? (a.payload?.before != null ? { payload: a.payload } : null))).join('')}</div>`
        : `<div class="empty"><h2>Chưa có góp ý nào</h2><p>Khi bạn sửa bài rồi đăng, Studio hỏi vì sao. Câu trả lời hiện ở đây.</p></div>`}`;
    main.querySelectorAll('[data-scope]').forEach((b) => { b.onclick = () => { scope = b.dataset.scope; paint(displayed); }; });
  };
  paint(initial);
  if (previous) {
    void fetchFeedback(key, memberIds).then((fresh) => {
      if (fresh.ids !== previous.ids && main.isConnected && location.hash === '#/gop-y'
        && (document.activeElement === main || document.activeElement === document.body) && window.scrollY < 100) paint(fresh);
    }).catch((error) => console.error(error));
  }
}
