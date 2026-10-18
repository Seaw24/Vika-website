import { SKIP_REASONS } from '../lib/feedback.js';
import { NEXT_TIME } from '../lib/edits.js';
import { esc, toast } from '../ui.js?v=20261017b';

// The reason chips used to set a card aside, in the Sunday review, and as the feedback chat's fallback.

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
