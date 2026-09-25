import { loadAssignments, loadEvents, loadPosts, recordEvent } from '../data.js';
import { reviewable } from '../lib/feedback.js';
import { esc, toast, icon, cardTags } from '../ui.js';
import { feedbackForm, wireFeedback } from './feedback.js';

export async function renderReview(main, ctx, week) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('bad week');
  const assignments = await loadAssignments(week, ctx.me.id);
  const [events, posts] = await Promise.all([loadEvents(assignments.map((a) => a.id)), loadPosts(assignments.map((a) => a.id))]);
  const pending = reviewable(assignments, events, posts);
  const [, m, d] = week.split('-').map(Number);
  let index = 0;
  function paint() {
    const a = pending[index];
    const pct = pending.length ? Math.round((index / pending.length) * 100) : 100;
    main.innerHTML = `<a class="linkish" href="#/">${icon('left')}Hôm nay</a>
      <div class="page-head" style="margin-top:6px"><div><p class="eyebrow">Tuần ${d}/${m} · nhìn lại</p><h1 class="page-title">${a ? 'Vì sao chưa dùng bài này?' : 'Đã xem hết.'}</h1>
        <p class="sub">${a ? `Bài ${index + 1} trên ${pending.length}. Bài chưa dùng về kho cho tuần sau. Mọi câu hỏi đều không bắt buộc.` : 'Góp ý đã lưu ở tab Góp ý.'}</p></div></div>
      <div class="review-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      ${a ? `<article class="panel review-card"><div class="tags" style="margin-bottom:12px">${cardTags(a.card)}</div><p class="quote">${esc(a.card.op)}</p>
          ${feedbackForm({ submit: 'Lưu và xem bài tiếp', cancel: 'Để sau' })}
          <p style="margin-top:8px"><a class="linkish" href="#/bai/${esc(a.id)}">Mở lại bài để đăng${icon('right')}</a></p></article>`
        : `<div class="stage"><h2 style="font-size:clamp(26px,4vw,36px);letter-spacing:-.03em">Tuần này xong.</h2><p class="muted" style="margin:10px 0 22px">Cảm ơn bạn đã nhìn lại.</p><a class="btn btn-gold" href="#/">Về Hôm nay</a></div>`}`;
    if (!a) return;
    wireFeedback(main.querySelector('form'), async (payload) => {
      await recordEvent({ type: 'skipped', assignment_id: a.id, card_id: a.card.id, payload: { kind: 'skip', ...payload } });
      toast('Đã lưu góp ý.'); index++; paint();
    }, () => { index++; paint(); });
  }
  paint();
}
