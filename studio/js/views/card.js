import { loadAssignment, loadEvents, loadPosts, recordEvent } from '../data.js';
import { choiceState, postingState, vnDate } from '../lib/week.js';
import { appLink, buildCt, fillTemplate } from '../lib/ct.js';
import { REASONS, NEXT_TIME, ENGINE_LABEL, PULL_LABEL, isEdited, buildAnswer } from '../lib/edits.js';
import { esc, copyText, toast, draftStore, icon, cardTags, autoGrow, initial } from '../ui.js';
import { settingsFor, diffHtml } from './shared.js';
import { feedbackForm, wireFeedback } from './feedback.js';

const THREADS_LIMIT = 500;
const THREADS_URL = 'https://www.threads.com/';
const PARTS = [
  ['op', 'Bài đăng', 'Đăng lên Threads'],
  ['r1', 'Bình luận 1', 'Tự trả lời ngay dưới bài'],
  ['r2', 'Bình luận 2', 'Trả lời tiếp, rồi ghim'],
];
const TABS = [['why', 'Vì sao chọn'], ['src', 'Bài gốc'], ['keep', 'Ý cần giữ']];

// The page renders once. Every action after that updates only the piece it changed, so typing,
// copying and choosing never reload the page or move the reader.
export async function renderCard(main, ctx, assignmentId) {
  const a = await loadAssignment(assignmentId);
  if (!a) {
    main.innerHTML = `<a class="linkish" href="#/">${icon('left')}Hôm nay</a><div class="empty" style="margin-top:16px"><h2>Không tìm thấy bài này</h2><p>Bài có thể đã được đổi tuần.</p></div>`;
    return;
  }
  const events = await loadEvents([a.id]);
  const view = {
    main,
    ctx,
    a,
    card: a.card,
    mine: a.member_id === ctx.me.id,
    cardAccounts: ctx.team.accounts.filter((x) => x.member_id === a.member_id && x.kind === 'card'),
    events,
    post: (await loadPosts([a.id]))[0] ?? null,
    tab: 'why',
    dismissed: new Set(),
    answered: new Set(events.filter((e) => e.type === 'answered' && e.payload?.kind === 'edit').map((e) => e.payload.part)),
  };
  paint(view);
}

const chosen = (view) => view.post ? { account_id: view.post.account_id, at: view.post.published_at, ct: view.post.ct }
  : choiceState(view.events).get(view.a.id) ?? null;
// The member's own word: "posted" (claimed) until the daily read confirms it, or "missing" when that read found nothing.
const claim = (view) => postingState(view.events, view.post ? [view.post] : []).get(view.a.id) ?? null;
const isClaimed = (view) => claim(view)?.status === 'claimed';
const VN = 'Asia/Ho_Chi_Minh';
const vnTime = (at) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN, hour: '2-digit', minute: '2-digit' }).format(new Date(at));
const nextRead = () => (Number(new Intl.DateTimeFormat('en-US', { timeZone: VN, hour: 'numeric', hour12: false }).format(new Date())) % 24 < 6 ? '06:00 sáng nay' : '06:00 sáng mai');
const whenPosted = (at) => `${vnTime(at)}${vnDate(new Date(at)) === vnDate() ? ' hôm nay' : ` ngày ${vnDate(new Date(at)).split('-').reverse().slice(0, 2).map(Number).join('/')}`}`;

function originals(view) {
  const c = chosen(view);
  const account = c ? view.cardAccounts.find((x) => x.id === c.account_id) ?? null : null;
  const r2 = account && c.ct ? fillTemplate(settingsFor(view.ctx, account).r2_template, appLink(c.ct)) : null;
  return { op: view.card.op, r1: view.card.r1, r2, account };
}

const draftKey = (view, part, account) => `${view.a.id}.${part}${part === 'r2' && account ? `.${account.id}` : ''}`;
const copiedParts = (view) => new Set(view.events.filter((e) => e.type === 'copied').map((e) => e.payload?.part));
const textOf = (view, part, o) => draftStore.get(draftKey(view, part, o.account)) ?? o[part];
const lastEdit = (view, part) => view.events.filter((e) => e.type === 'edited' && e.payload?.part === part).at(-1) ?? null;
const base = (view) => ({ assignment_id: view.a.id, card_id: view.card.id, account_id: chosen(view)?.account_id ?? null });
const q = (view, sel) => view.root.querySelector(sel);

// The next thing to do: the first part not yet copied. Bình luận 2 needs an account first.
function nextStep(view, o, copied) {
  if (isClaimed(view)) return null;
  for (const [part] of PARTS) {
    if (copied.has(part)) continue;
    if (part === 'r2' && o.r2 === null) return view.post || !view.mine ? null : 'pick';
    return part;
  }
  return null;
}

/* ---------- Markup ---------- */

const countText = (text) => `${[...text].length}/${THREADS_LIMIT}`;
const copyLabel = (done) => done ? `${icon('check')}Đã sao chép` : `${icon('copy')}Sao chép`;

function stateHtml(view, part, edited) {
  if (!edited) return '';
  const ask = view.mine && !view.answered.has(part) && view.dismissed.has(part)
    ? `<button type="button" data-why="${part}">Nói lý do sửa</button>` : '';
  const said = view.answered.has(part) ? '<span class="said">· đã gửi lý do</span>' : '';
  return `<span class="edited">Đã sửa<button type="button" data-restore="${part}">Về bản gốc</button>${ask}${said}</span>`;
}

function partBlock(view, [part, label, where], i, o) {
  const head = `<div class="part-head"><span class="label"><b>${esc(label)}</b><span class="where">${esc(where)}</span></span>`;
  if (part === 'r2' && o.r2 === null) {
    return `<li class="part" id="part-r2" data-i="${i}"><span class="step">${i + 1}</span><div class="part-card">${head}</div>
      <p class="part-empty">${view.mine && !view.post ? 'Chọn tài khoản ở trên để hiện bình luận 2 kèm link tải app riêng.' : 'Bình luận 2 hiện khi bài có tài khoản.'}</p></div></li>`;
  }
  const text = textOf(view, part, o);
  return `<li class="part" id="part-${part}" data-i="${i}">
    <span class="step">${i + 1}</span>
    <div class="part-card">
      ${head}<span class="count${[...text].length > THREADS_LIMIT ? ' over' : ''}" data-count="${part}">${countText(text)}</span></div>
      <textarea rows="1" aria-label="${esc(label)}" data-edit="${part}" spellcheck="false"${view.mine ? '' : ' readonly'}>${esc(text)}</textarea>
      <div class="part-foot"><span class="state" data-state="${part}">${stateHtml(view, part, isEdited(o[part], text))}</span>
        <button class="btn copy btn-line" data-copy="${part}">${copyLabel(false)}</button></div>
      <div data-reason-slot="${part}"></div>
      ${part === 'op' && view.card.runner_up_op ? `<details class="alt"><summary>Có bản thay thế cho bài đăng<span class="plus"></span></summary>
        <p class="plain">${esc(view.card.runner_up_op)}</p>
        <button class="btn sm btn-line" data-copy-alt style="margin-bottom:12px">${icon('copy')}Sao chép bản thay thế</button></details>` : ''}
    </div></li>`;
}

// Opens the moment a part stops matching the prepared text. Every answer is optional.
function reasonForm(view, part, text) {
  return `<form class="reason" data-reason-form="${part}">
    <div class="reason-head"><div><h3>Bạn vừa sửa phần này. Vì sao?</h3><p class="tiny muted">Không bắt buộc. Chọn nhanh một lý do là đủ, giúp bài sau viết đúng hơn.</p></div>
      <button type="button" class="linkish" data-dismiss="${part}">Để sau</button></div>
    <div data-diff style="margin-top:12px">${diffHtml(originals(view)[part], text, { from: 'Bản viết sẵn', to: 'Bản của bạn' })}</div>
    <div class="chips" style="margin-top:14px">${REASONS.map(([code, label]) => `<button type="button" data-reason-code="${code}" aria-pressed="false">${esc(label)}</button>`).join('')}</div>
    <label class="field"><span>Nói thêm (không bắt buộc)</span><textarea name="words" maxlength="4000" rows="2"></textarea></label>
    <p class="q">Bài sau có nên viết như vậy không?</p>
    <div class="chips">${NEXT_TIME.map(([code, label]) => `<button type="button" data-next="${code}" aria-pressed="false">${esc(label)}</button>`).join('')}</div>
    <div class="row-actions"><button class="btn btn-ink" type="submit">${icon('check')}Gửi lý do</button></div>
  </form>`;
}

function pickBlock(view, o) {
  const c = chosen(view);
  const k = claim(view);
  if (view.post) {
    return `<section class="pick" id="pick"><div class="posted-banner">${icon('check')}<span>Đã đăng trên <b>@${esc(o.account?.handle ?? '')}</b>. Lần đọc Threads đã xác nhận bài này.</span></div></section>`;
  }
  if (!view.mine) {
    return `<section class="pick" id="pick"><p class="notice">${icon('info')}<span>Bài của thành viên khác. Bạn xem và sao chép được, nhưng không chọn tài khoản.</span></p></section>`;
  }
  if (k?.status === 'claimed') {
    return `<section class="pick" id="pick"><div class="claim-banner">${icon('check')}<span class="grow"><b>Đã đăng trên @${esc(o.account?.handle ?? '')}</b> lúc ${esc(whenPosted(k.posted_at))}.
      <small>Máy đọc Threads xác nhận lúc ${nextRead()}. Bài kế tiếp đã lên Hôm nay. Bạn vẫn sửa được bên dưới cho đến lúc đó.</small></span>
      <button class="linkish" data-unpost>${icon('undo')}Chưa đăng, bỏ đánh dấu</button></div></section>`;
  }
  const missing = k?.status === 'missing' && view.cardAccounts.find((x) => x.id === k.account_id);
  return `<section class="pick" id="pick">${missing ? `<p class="notice warn">${icon('info')}<span>Lần đọc Threads không thấy bài này trên <b>@${esc(missing.handle)}</b> sau khi bạn đánh dấu đã đăng. Kiểm tra link ở bình luận 2, rồi chọn tài khoản để đăng lại.</span></p>` : ''}
    <p class="eyebrow">Đăng trên tài khoản</p>
    <div class="pick-list" role="group" aria-label="Chọn tài khoản">${view.cardAccounts.map((acc) => {
      const on = c?.account_id === acc.id;
      return `<button class="pick-btn" data-choose="${esc(acc.id)}" aria-pressed="${on}"><i class="av light">${esc(initial(acc.handle.split('.').at(-1)))}</i>
        <span class="who"><b>@${esc(acc.handle)}</b><small>${on ? 'Đang đăng trên tài khoản này' : 'Chạm để chọn'}</small></span><span class="check">${icon('check')}</span></button>`;
    }).join('')}</div>
    ${c ? `<div class="pick-foot"><span class="tiny muted">Link trong bình luận 2 là của tài khoản này.</span><span class="pick-acts"><button class="linkish" data-undo>${icon('undo')}Bỏ chọn</button><button class="linkish strong" data-posted>${icon('check')}Đã đăng xong</button></span></div>` : ''}</section>`;
}

function introHtml(view) {
  const k = claim(view);
  const [h, p] = view.post ? ['Bài đã đăng.', 'Nội dung bên dưới là bản viết sẵn.']
    : k?.status === 'claimed' ? ['Đã đăng, chờ xác nhận.', 'Máy đọc Threads sẽ tìm bài này trên tài khoản bạn chọn và bắt đầu đếm số liệu.']
    : ['Đăng bài này', 'Chọn tài khoản, rồi sao chép từng phần theo thứ tự vào Threads. Sửa thẳng trong khung nếu cần.'];
  return `<h1>${h}</h1><p class="muted" style="margin-top:8px">${p}</p>`;
}

function dockInner(view, next) {
  const label = PARTS.find(([p]) => p === next)?.[1];
  const act = view.post ? `<span class="done-msg">${icon('check')}<span>Bài đã đăng</span></span>`
    : isClaimed(view) ? `<span class="done-msg">${icon('check')}<span>Đã đăng · chờ xác nhận</span></span>`
    : !view.mine ? '<span class="done-msg"><span>Bài của thành viên khác</span></span>'
    : next === 'pick'
    ? '<button class="btn btn-gold main-act" data-dock="pick"><span>Chọn tài khoản để hiện bình luận 2</span></button>'
    : next
    ? `<button class="btn btn-gold main-act" data-dock="${next}">${icon('copy')}<span>Sao chép ${esc(label.toLowerCase())}</span></button>`
    : `<button class="btn btn-gold main-act" data-dock="posted">${icon('check')}<span>Đã đăng xong</span></button>`;
  return `<a class="icon-btn" href="#/" aria-label="Về Hôm nay">${icon('left')}</a>${act}
    <a class="icon-btn" href="${THREADS_URL}" target="_blank" rel="noopener noreferrer" aria-label="Mở Threads">${icon('out')}</a>`;
}

function tabPanel(view) {
  const card = view.card;
  const n = (v) => new Intl.NumberFormat('vi-VN').format(v);
  const stats = [[card.source_likes, 'lượt thích'], [card.source_replies, 'trả lời'], [card.source_views, 'lượt xem']].filter(([v]) => v != null);
  if (view.tab === 'src') {
    return `<p class="quote">${esc(card.source_original)}</p>
      ${card.source_gloss_vi ? `<p class="small muted" style="margin-top:14px"><b style="color:var(--ink);font-weight:500">Dịch sát:</b> ${esc(card.source_gloss_vi)}</p>` : ''}
      ${stats.length ? `<div class="src-stats">${stats.map(([v, l]) => `<div><b>${n(v)}</b><span>${l}</span></div>`).join('')}</div>` : ''}
      ${card.source_url ? `<p style="margin-top:14px"><a class="linkish" href="${esc(card.source_url)}" target="_blank" rel="noopener noreferrer">Mở bài gốc${icon('out')}</a></p>` : ''}`;
  }
  if (view.tab === 'keep') {
    return card.point_vi || card.build_vi
      ? `<p style="font-size:19px;letter-spacing:-.01em;line-height:1.5">${esc(card.point_vi ?? '')}</p>${card.build_vi ? `<p class="muted" style="margin-top:12px">${esc(card.build_vi)}</p>` : ''}`
      : '<p class="muted">Bài này chưa ghi ý cần giữ.</p>';
  }
  return `<dl>${card.reader_vi ? `<dt>Người đọc</dt><dd>${esc(card.reader_vi)}</dd>` : ''}
    ${card.move_vi ? `<dt>Người lạ sẽ làm gì</dt><dd>${esc(card.move_vi)}</dd>` : ''}
    ${card.pull ? `<dt>Dự đoán sức lan</dt><dd>${esc(PULL_LABEL[card.pull].replace('Dự đoán: ', '').replace(/^./, (c) => c.toUpperCase()))}</dd>` : ''}
    ${card.engine ? `<dt>Cách kéo tương tác</dt><dd>${esc(ENGINE_LABEL[card.engine])}</dd>` : ''}</dl>`;
}

const flagged = (view) => view.events.some((e) => e.type === 'flagged' && e.payload?.kind === 'wrong_pick');

function flagCard(view) {
  return `<section class="flag-card" id="flag">
    <div class="flag-head"><span class="flag-ic">${icon('flag')}</span>
      <div><h3>Bài này chọn chưa đúng?</h3><p>Nói cho nhóm biết để lần sau chọn bài tốt hơn. Bạn vẫn dùng bài này được.</p></div></div>
    <div data-flag-body>${flagged(view)
      ? `<p class="flag-done">${icon('check')}Bạn đã góp ý về bài này.</p><button class="btn btn-line sm" data-flag-open>Góp ý thêm</button>`
      : `<button class="btn btn-ink" data-flag-open>${icon('flag')}Góp ý về bài chọn</button>`}</div></section>`;
}

function paint(view) {
  const o = originals(view);
  view.main.innerHTML = `<div class="post-layout"><div class="post-main">
      <div class="post-top"><a class="linkish" href="#/">${icon('left')}Hôm nay</a><span class="tags">${cardTags(view.card)}</span></div>
      <div class="post-intro">${introHtml(view)}</div>
      ${pickBlock(view, o)}
      <ol class="thread">${PARTS.map((p, i) => partBlock(view, p, i, o)).join('')}</ol>
      <div class="dock" role="region" aria-label="Bước tiếp theo"></div></div>
    <aside class="post-aside"><section class="backstage"><p class="eyebrow">Hậu trường</p>
      <div class="seg" role="tablist" aria-label="Thông tin về bài">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${view.tab === k}" aria-selected="${view.tab === k}">${l}</button>`).join('')}</div>
      <div class="panel bs-panel" role="tabpanel" data-tab-panel>${tabPanel(view)}</div></section>
      ${view.mine ? flagCard(view) : ''}</aside></div>`;
  view.root = view.main.querySelector('.post-layout');
  view.root.querySelectorAll('[data-edit]').forEach(autoGrow);
  wire(view);
  sync(view);
  // A saved draft that differs from the prepared text asks its question right away.
  for (const [part] of PARTS) {
    const area = q(view, `[data-edit="${part}"]`);
    if (area) openReason(view, part, area.value);
  }
}

/* ---------- In-place updates ---------- */

// Step states, copy buttons and the dock follow the events; nothing else is touched.
function sync(view) {
  const o = originals(view);
  const copied = copiedParts(view);
  const next = nextStep(view, o, copied);
  for (const [part] of PARTS) {
    const li = q(view, `#part-${part}`);
    if (!li) continue;
    const done = copied.has(part);
    li.classList.toggle('done', done);
    li.classList.toggle('next', next === part || (part === 'r2' && next === 'pick'));
    li.querySelector('.step').innerHTML = done ? icon('check') : String(Number(li.dataset.i) + 1);
    const btn = li.querySelector('[data-copy]');
    if (btn) {
      btn.className = `btn copy ${done ? 'is-copied' : next === part ? 'btn-gold' : 'btn-line'}`;
      btn.innerHTML = copyLabel(done);
    }
  }
  const alt = q(view, '[data-copy-alt]');
  if (alt && copied.has('runner_up')) { alt.className = 'btn sm is-copied btn-ok'; alt.innerHTML = `${icon('check')}Đã sao chép bản thay thế`; }
  q(view, '.dock').innerHTML = dockInner(view, next);
}

function setState(view, part, text) {
  const edited = isEdited(originals(view)[part], text);
  q(view, `[data-state="${part}"]`).innerHTML = stateHtml(view, part, edited);
  return edited;
}

function openReason(view, part, text) {
  const slot = q(view, `[data-reason-slot="${part}"]`);
  if (!slot || !view.mine || view.post || view.answered.has(part) || view.dismissed.has(part)) return;
  if (!isEdited(originals(view)[part], text)) return;
  if (!slot.firstElementChild) slot.innerHTML = reasonForm(view, part, text);
}

let diffTimer;
function onEdit(view, area) {
  const part = area.dataset.edit;
  const o = originals(view);
  draftStore.set(draftKey(view, part, o.account), area.value);
  const count = q(view, `[data-count="${part}"]`);
  count.textContent = countText(area.value);
  count.classList.toggle('over', [...area.value].length > THREADS_LIMIT);
  const edited = setState(view, part, area.value);
  const slot = q(view, `[data-reason-slot="${part}"]`);
  const form = slot?.querySelector('form');
  if (!edited) {
    // Back to the prepared text: an untouched question goes away with the edit.
    if (form && !form.querySelector('[aria-pressed="true"]') && !form.elements.words.value.trim()) slot.innerHTML = '';
    return;
  }
  if (!form) { openReason(view, part, area.value); return; }
  clearTimeout(diffTimer);
  diffTimer = setTimeout(() => {
    form.querySelector('[data-diff]').innerHTML = diffHtml(o[part], area.value, { from: 'Bản viết sẵn', to: 'Bản của bạn' });
  }, 150);
}

function restore(view, part) {
  const o = originals(view);
  draftStore.drop(draftKey(view, part, o.account));
  const area = q(view, `[data-edit="${part}"]`);
  area.value = o[part];
  area.dispatchEvent(new Event('input', { bubbles: true }));
  toast('Đã về bản viết sẵn.');
}

async function choose(view, accountId) {
  if (view.post || isClaimed(view)) return;
  const current = chosen(view);
  if (current?.account_id === accountId) return;
  const account = view.cardAccounts.find((x) => x.id === accountId);
  const s = settingsFor(view.ctx, account);
  const ct = buildCt(s.account_code, view.card.card_code);
  if (current) view.events.push(await recordEvent({ ...base(view), type: 'undo_choice' }));
  view.events.push(await recordEvent({ assignment_id: view.a.id, card_id: view.card.id, account_id: account.id, type: 'chose_account', payload: { ct, account_code: s.account_code, settings_at: s.created_at } }));
  toast(`Đăng trên @${account.handle}. Bình luận 2 đã có link.`);
  afterChoice(view);
}

async function undo(view) {
  if (view.post || isClaimed(view) || !chosen(view)) return;
  view.events.push(await recordEvent({ ...base(view), type: 'undo_choice' }));
  afterChoice(view);
}

// The member's word that the post is up. The account frees on Hôm nay at once; the daily read confirms later.
async function markPosted(view) {
  const c = chosen(view);
  if (view.post || isClaimed(view) || !c || !view.mine) return;
  const account = view.cardAccounts.find((x) => x.id === c.account_id);
  view.events.push(await recordEvent({ ...base(view), type: 'posted', payload: { ct: c.ct, from: 'card' } }));
  toast(`Đã ghi: đăng trên @${account?.handle ?? ''}. Bài kế tiếp đã lên Hôm nay.`);
  afterChoice(view);
  q(view, '#pick')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function unpost(view) {
  if (view.post || !isClaimed(view)) return;
  view.events.push(await recordEvent({ ...base(view), type: 'posted_undo' }));
  toast('Đã bỏ đánh dấu. Bài lại đang đăng.');
  afterChoice(view);
}

// A choice changes only the picker, the intro line and Bình luận 2.
function afterChoice(view) {
  const o = originals(view);
  q(view, '.post-intro').innerHTML = introHtml(view);
  q(view, '#pick').outerHTML = pickBlock(view, o);
  const li = q(view, '#part-r2');
  const tpl = document.createElement('template');
  tpl.innerHTML = partBlock(view, PARTS[2], 2, o).trim();
  li.replaceWith(tpl.content.firstElementChild);
  const area = q(view, '[data-edit="r2"]');
  if (area) autoGrow(area);
  sync(view);
}

async function copyPart(view, part) {
  const area = q(view, `[data-edit="${part}"]`);
  const text = area.value;
  if (!(await copyText(text))) {
    toast('Chưa sao chép được. Hãy chọn chữ và sao chép.');
    return;
  }
  toast(`Đã sao chép ${PARTS.find(([p]) => p === part)[1].toLowerCase()}. Dán vào Threads nhé.`);
  if (!view.mine) return;
  const original = originals(view)[part];
  if (isEdited(original, text) && lastEdit(view, part)?.payload?.after !== text) {
    view.events.push(await recordEvent({ ...base(view), type: 'edited', payload: { part, before: original, after: text, where: 'portal' } }));
  }
  view.events.push(await recordEvent({ ...base(view), type: 'copied', payload: { part, text } }));
  sync(view);
  // Bring the next part up, unless this part still has an open question.
  if (q(view, `[data-reason-slot="${part}"] form`)) return;
  const next = nextStep(view, originals(view), copiedParts(view));
  const el = next === 'pick' ? q(view, '#pick') : next ? q(view, `#part-${next}`) : null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyAlt(view) {
  const text = view.card.runner_up_op;
  if (!(await copyText(text))) {
    toast('Chưa sao chép được. Hãy chọn chữ và sao chép.');
    return;
  }
  toast('Đã sao chép bản thay thế.');
  if (!view.mine) return;
  view.events.push(await recordEvent({ ...base(view), type: 'used_runner_up', payload: { text } }));
  view.events.push(await recordEvent({ ...base(view), type: 'copied', payload: { part: 'runner_up', text } }));
  sync(view);
}

async function submitReason(view, form) {
  const part = form.dataset.reasonForm;
  const text = q(view, `[data-edit="${part}"]`).value;
  const original = originals(view)[part];
  const reasons = [...form.querySelectorAll('[data-reason-code][aria-pressed="true"]')].map((b) => b.dataset.reasonCode);
  const next = form.querySelector('[data-next][aria-pressed="true"]')?.dataset.next ?? null;
  const words = form.elements.words.value;
  if (!reasons.length && !words.trim() && !next) { toast('Chọn một lý do hoặc viết vài chữ nhé.'); return; }
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    // The edit is saved with its answer, so the answer always points at the exact text it explains.
    let edit = lastEdit(view, part);
    if (isEdited(original, text) && edit?.payload?.after !== text) {
      edit = await recordEvent({ ...base(view), type: 'edited', payload: { part, before: original, after: text, where: 'portal' } });
      view.events.push(edit);
    }
    const answer = buildAnswer({ editClientId: edit?.client_id ?? null, part, reasons, words, nextTime: next });
    view.events.push(await recordEvent({ ...base(view), type: 'answered', payload: answer }));
    view.answered.add(part);
    form.parentElement.innerHTML = `<p class="reason-done">${icon('check')}Đã gửi lý do. Cảm ơn bạn.</p>`;
    setState(view, part, text);
  } catch {
    toast('Chưa lưu được. Thử lại nhé.');
    button.disabled = false;
  }
}

function openFlag(view) {
  const body = q(view, '[data-flag-body]');
  const before = body.innerHTML;
  body.innerHTML = feedbackForm({ submit: 'Gửi góp ý', cancel: 'Thôi' });
  const form = body.querySelector('form');
  wireFeedback(form, async (payload) => {
    if (!payload.reasons.length && !payload.words) { toast('Chọn một lý do hoặc viết góp ý nhé.'); form.querySelector('[type=submit]').disabled = false; return; }
    view.events.push(await recordEvent({ ...base(view), type: 'flagged', payload: { kind: 'wrong_pick', ...payload } }));
    toast('Đã gửi góp ý về bài chọn.');
    body.innerHTML = `<p class="flag-done">${icon('check')}Đã gửi. Cảm ơn bạn.</p><button class="btn btn-line sm" data-flag-open>Góp ý thêm</button>`;
  }, () => { body.innerHTML = before; });
  form.querySelector('button')?.focus({ preventScroll: true });
}

/* ---------- One set of listeners for the whole page ---------- */

function wire(view) {
  const { root } = view;
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-edit]')) onEdit(view, e.target);
  });
  root.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-reason-form]');
    if (!form) return;
    e.preventDefault();
    submitReason(view, form);
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    const d = b.dataset;
    if (d.choose) choose(view, d.choose);
    else if ('undo' in d) undo(view);
    else if ('posted' in d || d.dock === 'posted') markPosted(view);
    else if ('unpost' in d) unpost(view);
    else if (d.copy) copyPart(view, d.copy);
    else if ('copyAlt' in d) copyAlt(view);
    else if (d.dock === 'pick') q(view, '#pick')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else if (d.dock) copyPart(view, d.dock);
    else if (d.restore) restore(view, d.restore);
    else if (d.dismiss) {
      view.dismissed.add(d.dismiss);
      q(view, `[data-reason-slot="${d.dismiss}"]`).innerHTML = '';
      setState(view, d.dismiss, q(view, `[data-edit="${d.dismiss}"]`).value);
    } else if (d.why) {
      view.dismissed.delete(d.why);
      openReason(view, d.why, q(view, `[data-edit="${d.why}"]`).value);
      setState(view, d.why, q(view, `[data-edit="${d.why}"]`).value);
      q(view, `[data-reason-slot="${d.why}"]`).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (d.reasonCode) {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    } else if (d.next) {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.closest('.chips').querySelectorAll('[data-next]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', String(on));
    } else if (d.tab) {
      view.tab = d.tab;
      root.querySelectorAll('[data-tab]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-selected', String(x === b)); });
      q(view, '[data-tab-panel]').innerHTML = tabPanel(view);
    } else if ('flagOpen' in d) openFlag(view);
  });
}
