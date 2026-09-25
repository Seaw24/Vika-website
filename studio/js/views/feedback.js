import { recordEvent } from '../data.js';
import { SKIP_REASONS } from '../lib/feedback.js';
import { REASONS, NEXT_TIME, PART_LABEL } from '../lib/edits.js';
import { esc, toast, icon } from '../ui.js';
import { diffHtml } from './shared.js';

export function feedbackForm({ submit = 'Lưu góp ý', reasons = SKIP_REASONS, nextTime = false, cancel = 'Để sau' } = {}) {
  return `<form class="feedback-form"><div class="chips">${reasons.map(([code, label]) => `<button type="button" data-feedback-reason="${code}" aria-pressed="false">${esc(label)}</button>`).join('')}</div>
    <label class="field"><span>Nói thêm (không bắt buộc)</span><textarea name="words" maxlength="4000" rows="3"></textarea></label>
    ${nextTime ? `<p class="small muted" style="margin:14px 0 8px">Bài sau có nên viết như vậy không?</p><div class="chips">${NEXT_TIME.map(([code, label]) => `<button type="button" data-next-time="${code}" aria-pressed="false">${esc(label)}</button>`).join('')}</div>` : ''}
    <div class="row-actions"><button type="submit" class="btn btn-ink">${esc(submit)}</button><button type="button" class="btn btn-line" data-cancel>${esc(cancel)}</button></div></form>`;
}

export function wireFeedback(form, save, cancel) {
  const reasons = new Set();
  let next = null;
  form.querySelectorAll('[data-feedback-reason]').forEach((button) => { button.onclick = () => {
    const reason = button.dataset.feedbackReason;
    if (reasons.has(reason)) reasons.delete(reason); else reasons.add(reason);
    button.setAttribute('aria-pressed', String(reasons.has(reason)));
  }; });
  form.querySelectorAll('[data-next-time]').forEach((button) => { button.onclick = () => {
    next = next === button.dataset.nextTime ? null : button.dataset.nextTime;
    form.querySelectorAll('[data-next-time]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.nextTime === next)));
  }; });
  form.querySelector('[data-cancel]').onclick = cancel;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try { await save({ reasons: [...reasons], words: form.elements.words.value.trim(), next_time: next }); }
    catch { toast('Chưa lưu được. Thử lại nhé.'); button.disabled = false; }
  };
}

// The day after a post, the daily read asks about each change the member made in Threads. One at a time, all optional.
export function renderQuestions(host, questions) {
  let index = 0;
  function paint() {
    const q = questions[index];
    if (!q) { host.innerHTML = ''; return; }
    const base = { assignment_id: q.assignment_id, card_id: q.assignment?.card_id, account_id: q.account_id };
    async function answer(payload, type = 'answered') {
      await recordEvent({ ...base, type, payload: { kind: 'posted_edit', question_id: q.id, part: q.part,
        before: q.before_text, after: q.after_text, guess: q.guess, model: q.model, ...payload } });
      if (type === 'answered') toast('Đã lưu. Cảm ơn bạn.');
      index++; paint();
    }
    const left = questions.length - index;
    host.innerHTML = `<section class="panel sand question" aria-live="polite">
      <p class="eyebrow">Câu hỏi từ lần đọc Threads · còn ${left}</p>
      <h2>Bạn đã sửa ${esc((PART_LABEL[q.part] ?? q.part).toLowerCase())} khi đăng</h2>
      <p class="small muted">So với bản bạn sao chép. Trả lời lúc nào cũng được.</p>
      ${diffHtml(q.before_text, q.after_text, { from: 'Bản sao chép', to: 'Bản đã đăng' })}
      ${q.guess ? `<p class="guess">Mình đoán vì ${esc(q.guess)}. Đúng không?</p><p class="tiny muted">Suy đoán của máy · ${esc(q.model)}</p>` : '<p class="guess">Vì sao bạn sửa chỗ này?</p>'}
      <div class="actions">${q.guess ? `<button class="btn btn-ink" data-agree>${icon('check')}Đúng</button>` : ''}<button class="btn btn-line" data-explain>${q.guess ? 'Không, vì…' : 'Trả lời'}</button><button class="linkish" data-dismiss style="padding:0 10px">Bỏ qua</button></div>
      <div data-form></div></section>`;
    host.querySelector('[data-agree]')?.addEventListener('click', () => answer({ agree: true }));
    host.querySelector('[data-dismiss]').onclick = () => answer({}, 'question_dismissed');
    host.querySelector('[data-explain]').onclick = () => {
      const box = host.querySelector('[data-form]');
      box.innerHTML = `<div style="margin-top:16px">${feedbackForm({ reasons: REASONS, nextTime: true })}</div>`;
      wireFeedback(box.querySelector('form'), (payload) => answer({ ...payload, agree: q.guess ? false : null }), () => { box.innerHTML = ''; });
    };
  }
  paint();
}
