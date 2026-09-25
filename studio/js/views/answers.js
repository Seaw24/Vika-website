import { loadAnswers, loadAnswerQuestions } from '../data.js';
import { REASONS, NEXT_TIME, PART_LABEL, labelFor } from '../lib/edits.js';
import { SKIP_REASONS } from '../lib/feedback.js';
import { esc, firstLine, initial } from '../ui.js';
import { diffHtml } from './shared.js';

const when = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const KINDS = { skip: ['Bài chưa dùng', 'line'], wrong_pick: ['Góp ý về bài chọn', 'gold'], posted_edit: ['Chỗ sửa khi đăng', 'dark'], edit: ['Chỗ sửa trên portal', ''] };
let scope = 'all';

function entry(a, edit) {
  const p = a.payload ?? {};
  const [title, tone] = KINDS[p.kind] ?? ['Góp ý', ''];
  return `<article class="entry"><i class="av light">${esc(initial(a.member?.name))}</i><div class="panel entry-card">
    <div class="entry-head"><b>${esc(a.member?.name ?? '')}</b><span class="tiny muted">${esc(when.format(new Date(a.at)))}</span></div>
    <div class="tags" style="margin-top:8px"><span class="tag ${tone}">${esc(title)}</span>${p.part ? `<span class="tag line">${esc(PART_LABEL[p.part] ?? '')}</span>` : ''}${a.account ? `<span class="tag line">@${esc(a.account.handle)}</span>` : ''}</div>
    ${a.card?.op ? `<p class="about">Bài: <q>${esc(firstLine(a.card.op, 90))}</q></p>` : ''}
    ${p.guess ? `<p class="guessline">Máy đoán: ${esc(p.guess)} <span class="tiny muted">· ${esc(p.model)}</span><br><b style="font-weight:500">${p.agree === true ? 'Thành viên xác nhận đúng.' : 'Thành viên không đồng ý.'}</b></p>` : ''}
    ${p.reasons?.length ? `<div class="tags">${p.reasons.map((r) => `<span class="tag">${esc(labelFor([...REASONS, ...SKIP_REASONS], r))}</span>`).join('')}</div>` : ''}
    ${p.words ? `<p class="words">${esc(p.words)}</p>` : ''}
    ${p.next_time ? `<p class="small muted" style="margin-top:10px">Bài sau: <b style="color:var(--ink);font-weight:500">${esc(labelFor(NEXT_TIME, p.next_time))}</b></p>` : ''}
    ${edit ? `<details><summary>Xem chỗ sửa</summary>${diffHtml(edit.payload.before, edit.payload.after)}</details>` : ''}
  </div></article>`;
}

export async function renderAnswers(main, ctx) {
  const rows = await loadAnswers(ctx.team.members.map((m) => m.id));
  const questions = new Map((await loadAnswerQuestions([...new Set(rows.map((r) => r.payload?.question_id).filter(Boolean))])).map((q) => [q.id, q]));
  for (const row of rows) {
    const q = questions.get(row.payload?.question_id);
    if (q) row.payload = { ...row.payload, guess: q.guess, model: q.model, before: q.before_text, after: q.after_text };
  }
  const edits = new Map(rows.filter((r) => r.type === 'edited').map((r) => [r.client_id, r]));
  const answers = rows.filter((r) => ['answered', 'skipped', 'flagged'].includes(r.type));
  const paint = () => {
    const shown = scope === 'mine' ? answers.filter((a) => a.member?.name === ctx.me.name) : answers;
    main.innerHTML = `<div class="page-head"><div><p class="eyebrow">Góp ý</p><h1 class="page-title">Cả nhóm nói gì</h1>
        <p class="sub">Lý do sửa bài, bài chưa dùng và bài chọn chưa đúng. Mới nhất trước, ai cũng xem được.</p></div>
      <div class="seg" role="group" aria-label="Lọc góp ý"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">Cả nhóm · ${answers.length}</button><button type="button" data-scope="mine" aria-pressed="${scope === 'mine'}">Của tôi</button></div></div>
      ${shown.length ? `<div class="feed">${shown.map((a) => entry(a, edits.get(a.payload?.edit_client_id) ?? (a.payload?.before != null ? { payload: a.payload } : null))).join('')}</div>`
        : `<div class="empty"><h2>Chưa có góp ý nào</h2><p>Khi bạn sửa một phần rồi sao chép, portal hỏi vì sao. Câu trả lời hiện ở đây.</p></div>`}`;
    main.querySelectorAll('[data-scope]').forEach((b) => { b.onclick = () => { scope = b.dataset.scope; paint(); }; });
  };
  paint();
}
