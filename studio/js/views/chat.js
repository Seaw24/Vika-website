import { askFeedbackChat, recordEvent } from '../data.js?v=20261011x';
import { chatAnswers, formAnswers } from '../lib/chat.js';
import { REASONS, PART_LABEL } from '../lib/edits.js';
import { esc, toast, icon, firstLine } from '../ui.js?v=20261011x';
import { diffHtml } from './shared.js';
import { feedbackForm, wireFeedback } from './feedback.js?v=20261011x';

// The feedback chat (docs/plans/2026-10-12-feedback-chat.md): the bot guesses why she made each change,
// she taps Đúng or says why, at most two rounds, then the answers are saved and the sheet closes.
// Để sau saves nothing; the card stays on Hôm nay. Without the bot, the old reason form takes over.

const SCOPE = [['always', 'Luôn vậy'], ['this_post', 'Chỉ bài này']];

function changeHtml(c) {
  const where = esc((PART_LABEL[c.part] ?? c.part).toLowerCase());
  if (c.whole) return `<div class="chat-change"><span class="tiny muted">Cả ${where}</span>${diffHtml(c.before, c.after, { from: 'Bản cũ', to: 'Bản của bạn' })}</div>`;
  const side = (t, cls) => (t ? `<span class="${cls}">${esc(t)}</span>` : `<span class="${cls} none">(không có)</span>`);
  return `<p class="chat-change"><span class="tiny muted">${where}</span> ${side(c.before, 'was')}${icon('right')}${side(c.after, 'now')}</p>`;
}

function questionHtml(q, change) {
  return `<div class="chat-q" data-q="${esc(q.change_id)}">
    ${changeHtml(change)}
    <p class="chat-msg bot">${esc(q.text)}</p>
    <div class="chips" role="group" aria-label="Trả lời">
      <button type="button" data-agree="yes" aria-pressed="false">Đúng</button>
      <button type="button" data-agree="no" aria-pressed="false">Không</button></div>
    <label class="field"><span class="sr-only">Lý do của bạn</span><textarea rows="1" maxlength="1000" placeholder="Lý do của bạn (không bắt buộc)"></textarea></label>
    <div class="chips scope" role="group" aria-label="Bài sau">${SCOPE.map(([v, l]) => `<button type="button" data-scope="${v}" aria-pressed="false">${l}</button>`).join('')}</div>
  </div>`;
}

const answerLine = (a) => [a.agree === 'yes' ? 'Đúng' : a.agree === 'no' ? 'Không' : '', a.words, SCOPE.find(([v]) => v === a.scope)?.[1]]
  .filter(Boolean).join(' · ') || 'Bỏ qua';

export function openChat({ host, entry, card, onSaved = () => {} }) {
  const byId = new Map(entry.changes.map((c) => [c.id, c]));
  const turns = [];
  let current = null;
  let saved = false;
  const chatId = crypto.randomUUID();
  const sheet = document.createElement('dialog');
  sheet.className = 'sheet chat-sheet';
  sheet.setAttribute('aria-labelledby', 'chat-title');
  sheet.innerHTML = `<div class="sheet-grip" aria-hidden="true"></div>
    <h2 id="chat-title">Kể nhanh vì sao bạn sửa</h2>
    <p class="small muted">${esc(firstLine(card?.op ?? '', 90))}</p>
    <div class="chat-log" aria-live="polite"></div>
    <div class="row-actions"><button type="button" class="btn btn-ink" data-send disabled>${icon('check')}Gửi</button>
      <button type="button" class="btn btn-line" data-later>Để sau</button></div>`;
  host.append(sheet);
  const log = sheet.querySelector('.chat-log');
  const send = sheet.querySelector('[data-send]');
  const later = sheet.querySelector('[data-later]');
  const close = () => sheet.close();
  later.onclick = close;
  sheet.onclose = () => { sheet.remove(); if (saved) onSaved(); };
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !log.contains(b)) return;
    const group = b.closest('.chips');
    const on = b.getAttribute('aria-pressed') !== 'true';
    group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', String(on));
  });
  sheet.showModal();

  const thinking = () => { log.insertAdjacentHTML('beforeend', '<p class="chat-msg bot wait" data-wait><i></i><i></i><i></i></p>'); log.lastElementChild.scrollIntoView({ block: 'nearest' }); };
  const stopThinking = () => log.querySelector('[data-wait]')?.remove();

  async function ask() {
    send.disabled = true;
    thinking();
    let res;
    try { res = await askFeedbackChat({ card, changes: entry.changes.map(({ id, part, whole, before, after }) => ({ id, part, whole, before, after })), turns }); }
    catch { res = null; }
    stopThinking();
    if (!res?.reply) { fallback(); return; }
    const { reply, model } = res;
    if (reply.done) { await finish(reply, model); return; }
    current = reply;
    turns.push({ role: 'bot', say: reply.say, questions: reply.questions.map(({ change_id, text }) => ({ change_id, text })) });
    log.insertAdjacentHTML('beforeend', `${reply.say ? `<p class="chat-msg bot">${esc(reply.say)}</p>` : ''}
      <div class="chat-round">${reply.questions.map((q) => questionHtml(q, byId.get(q.change_id))).join('')}</div>`);
    log.querySelector('.chat-round:last-child .chat-q')?.scrollIntoView({ block: 'nearest' });
    send.disabled = false;
  }

  send.onclick = () => {
    if (!current) return;
    const round = log.querySelector('.chat-round:last-child');
    const answers = [...round.querySelectorAll('.chat-q')].map((el) => ({
      change_id: el.dataset.q,
      agree: el.querySelector('[data-agree][aria-pressed="true"]')?.dataset.agree ?? 'none',
      words: el.querySelector('textarea').value.trim(),
      scope: el.querySelector('[data-scope][aria-pressed="true"]')?.dataset.scope ?? null,
    }));
    turns.push({ role: 'member', answers });
    round.querySelectorAll('.chat-q').forEach((el, i) => {
      el.querySelector('.chips').remove(); el.querySelector('.field').remove(); el.querySelector('.scope').remove();
      el.insertAdjacentHTML('beforeend', `<p class="chat-msg me">${esc(answerLine(answers[i]))}</p>`);
    });
    current = null;
    ask();
  };

  async function finish(reply, model) {
    try {
      for (const payload of chatAnswers({ entry, reply, turns, model, chatId })) {
        await recordEvent({ type: 'answered', assignment_id: entry.assignment_id, card_id: entry.card_id, payload });
      }
      saved = true;
    } catch { toast('Chưa lưu được. Thử lại nhé.'); send.disabled = false; return; }
    log.insertAdjacentHTML('beforeend', `<p class="chat-msg bot">${esc(reply.say)}</p>`);
    send.outerHTML = `<button type="button" class="btn btn-ink" data-done>${icon('check')}Xong</button>`;
    later.remove();
    sheet.querySelector('[data-done]').onclick = close;
  }

  // The old reason chips, one answer for the whole card, when the bot is not reachable.
  function fallback() {
    send.remove();
    later.remove();
    log.innerHTML = `<p class="small muted">Chưa nói chuyện được với máy. Chọn nhanh lý do cho các chỗ bạn sửa:</p>
      ${entry.changes.map(changeHtml).join('')}<div data-form>${feedbackForm({ reasons: REASONS, nextTime: true, submit: 'Gửi lý do' })}</div>`;
    wireFeedback(log.querySelector('form'), async ({ reasons, words, next_time: nextTime }) => {
      if (!reasons.length && !words && !nextTime) { toast('Chọn một lý do hoặc viết vài chữ nhé.'); log.querySelector('[type=submit]').disabled = false; return; }
      for (const payload of formAnswers({ entry, reasons, words, nextTime })) {
        await recordEvent({ type: 'answered', assignment_id: entry.assignment_id, card_id: entry.card_id, payload });
      }
      saved = true;
      toast('Đã lưu. Cảm ơn bạn.');
      close();
    }, close);
  }

  ask();
}
