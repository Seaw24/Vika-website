import { addComment, deleteComment } from '../data.js?v=20261028a';
import { NOTE_TAGS, tagLabel, noteReady, timeAgo } from '../lib/feed.js?v=20261028a';
import { esc, icon, initial, toast, firstLine } from '../ui.js?v=20261028a';

// Góp ý nội dung (Nam, 2026-10-27): one thread per card that the whole team reads and writes, beside the card in the
// feed and on the card page. It replaces Không dùng bài này: a note says what is wrong or right with the idea, and the
// card stays in the pool. Notes about the words do not belong here; she edits the words and Kể lý do sửa asks why.

// The feed shows the newest notes; older ones open on a tap.
const SHOWN = 3;
const touch = () => window.matchMedia('(pointer: coarse)').matches;

const nameOf = (ctx, note) => (note.member_id === ctx.me.id ? 'Bạn'
  : ctx.team.members.find((m) => m.id === note.member_id)?.name ?? 'Thành viên');
const noteText = (note) => note.body || (note.tags ?? []).map(tagLabel).filter(Boolean).join(', ');

function noteHtml(ctx, note, { old = false } = {}) {
  const mine = note.member_id === ctx.me.id;
  const tags = (note.tags ?? []).map(tagLabel).filter(Boolean);
  const when = note.failed ? '' : note.pending ? 'Đang gửi…' : timeAgo(note.created_at);
  return `<li class="note${old ? ' is-old' : ''}${note.pending ? ' is-pending' : ''}${note.failed ? ' is-failed' : ''}" data-note="${esc(note.id)}">
    <i class="av sm ${mine ? 'gold' : 'light'}">${esc(initial(mine ? ctx.me.name : nameOf(ctx, note)))}</i>
    <div class="note-body"><div class="note-top"><b>${esc(nameOf(ctx, note))}</b><span>${esc(when)}</span>
      ${note.failed ? `<button type="button" class="note-act warn" data-note-retry="${esc(note.id)}">Chưa gửi được · Gửi lại</button>`
        : mine && !note.pending ? `<button type="button" class="note-act" data-note-del="${esc(note.id)}">Xoá</button>` : ''}</div>
      ${tags.length ? `<div class="note-tags">${tags.map((t) => `<span class="tag line">${esc(t)}</span>`).join('')}</div>` : ''}
      ${note.body ? `<p>${esc(note.body)}</p>` : ''}</div></li>`;
}

const previewHtml = (ctx, notes) => {
  const last = notes.at(-1);
  return last ? `<b>${esc(nameOf(ctx, last))}:</b> ${esc(firstLine(noteText(last), 70))}` : 'Chưa ai góp ý';
};

const HEAD = {
  feed: 'Về ý của bài, không phải câu chữ.',
  card: 'Cả nhóm bàn về ý của bài: có nên đăng không, ý có rõ, có hợp người đọc không. Góp ý không bỏ bài, bài vẫn ở kho cho bạn khác. Câu chữ chưa ổn thì sửa thẳng trong khung bài, Studio hỏi lý do sửa sau khi bạn đăng.',
};
const EMPTY = {
  feed: 'Chưa ai góp ý về ý bài này.',
  card: 'Chưa ai góp ý. Bạn thấy ý bài này thế nào?',
};

// place: 'feed' (a bar on a phone that opens the thread; always open beside the card on a computer) or 'card'.
export function talkHtml(ctx, card, notes, { place = 'feed', open = false, showOld = false } = {}) {
  const n = notes.length;
  const older = place === 'feed' && !showOld ? Math.max(0, n - SHOWN) : 0;
  return `<section class="talk is-${place}${open ? ' is-open' : ''}" data-thread="${esc(card.id)}" aria-label="Góp ý nội dung">
    <button type="button" class="talk-bar" data-talk-toggle aria-expanded="${open}">
      ${icon('feedback')}<span class="talk-title">Góp ý nội dung</span><span class="talk-n" data-talk-n>${n || ''}</span>
      <span class="talk-prev" data-talk-prev>${previewHtml(ctx, notes)}</span><span class="chev">${icon('down')}</span></button>
    <div class="talk-fold"><div class="talk-inner">
      <header class="talk-head"><h3>${icon('feedback')}Góp ý nội dung<span class="talk-n" data-talk-n>${n || ''}</span></h3><p>${esc(HEAD[place])}</p></header>
      ${older ? `<button type="button" class="talk-older" data-talk-older>Xem ${older} góp ý trước</button>` : ''}
      <ol class="notes" data-notes>${notes.map((note, i) => noteHtml(ctx, note, { old: i < older })).join('')}</ol>
      <p class="talk-empty"${n ? ' hidden' : ''}>${esc(EMPTY[place])}</p>
      <form class="talk-form" novalidate>
        <div class="talk-chips" role="group" aria-label="Chọn nhanh">${NOTE_TAGS.map(([code, label]) => `<button type="button" data-note-tag="${code}" aria-pressed="false">${esc(label)}</button>`).join('')}</div>
        <div class="talk-compose"><textarea name="body" rows="1" maxlength="2000" placeholder="Góp ý về ý của bài…" aria-label="Góp ý nội dung"></textarea>
          <button type="submit" class="talk-send" aria-label="Gửi góp ý" disabled>${icon('right')}</button></div>
      </form>
    </div></div></section>`;
}

/* ---------- One set of listeners for every thread under root ---------- */

// Every card's notes, newest last, for the whole session: a note she sends on the card page is in the feed when she
// comes back, without a new read.
export const threads = new Map();

// onChange(cardId, notes) runs after every change, for the feed's counts and filter.
export function wireTalk(root, ctx, { onChange = () => {} } = {}) {
  const talkOf = (el) => el.closest('[data-thread]');
  const listOf = (talk) => threads.get(talk.dataset.thread) ?? [];

  function refresh(talk) {
    const notes = listOf(talk);
    talk.querySelectorAll('[data-talk-n]').forEach((el) => { el.textContent = notes.length || ''; });
    talk.querySelector('[data-talk-prev]').innerHTML = previewHtml(ctx, notes);
    talk.querySelector('.talk-empty').hidden = notes.length > 0;
    onChange(talk.dataset.thread, notes);
  }
  function syncForm(form) {
    const draft = { body: form.elements.body.value, tags: [...form.querySelectorAll('[data-note-tag][aria-pressed="true"]')] };
    const ready = noteReady({ body: draft.body, tags: draft.tags });
    form.classList.toggle('has-draft', ready);
    form.querySelector('.talk-send').disabled = !ready;
  }
  function grow(area) {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 168)}px`;
  }
  function putNote(talk, note, replaceId = note.id) {
    const tpl = document.createElement('template');
    tpl.innerHTML = noteHtml(ctx, note).trim();
    const old = talk.querySelector(`[data-note="${CSS.escape(String(replaceId))}"]`);
    if (old) old.replaceWith(tpl.content.firstElementChild);
    else talk.querySelector('[data-notes]').append(tpl.content.firstElementChild);
  }

  async function deliver(talk, note) {
    const cardId = talk.dataset.thread;
    try {
      const saved = await addComment({ client_id: note.client_id, card_id: cardId, body: note.body, tags: note.tags });
      const list = listOf(talk);
      const at = list.findIndex((x) => x.id === note.id);
      if (at >= 0) list[at] = saved;
      putNote(talk, saved, note.id);
    } catch (error) {
      console.error(error);
      note.pending = false;
      note.failed = true;
      putNote(talk, note);
    }
    refresh(talk);
  }

  function send(form) {
    const talk = talkOf(form);
    const area = form.elements.body;
    const tags = [...form.querySelectorAll('[data-note-tag][aria-pressed="true"]')].map((b) => b.dataset.noteTag);
    const body = area.value.trim();
    if (!noteReady({ body, tags })) return;
    const note = { id: `tmp-${crypto.randomUUID()}`, client_id: crypto.randomUUID(), card_id: talk.dataset.thread, member_id: ctx.me.id,
      body, tags, created_at: new Date().toISOString(), pending: true };
    if (!threads.has(talk.dataset.thread)) threads.set(talk.dataset.thread, []);
    threads.get(talk.dataset.thread).push(note);
    putNote(talk, note);
    area.value = '';
    grow(area);
    form.querySelectorAll('[data-note-tag]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    syncForm(form);
    refresh(talk);
    deliver(talk, note);
  }

  async function remove(talk, id) {
    const list = listOf(talk);
    const at = list.findIndex((x) => String(x.id) === id);
    if (at < 0) return;
    const [note] = list.splice(at, 1);
    const li = talk.querySelector(`[data-note="${CSS.escape(id)}"]`);
    li?.classList.add('is-leaving');
    setTimeout(() => li?.remove(), 220);
    refresh(talk);
    try { await deleteComment(note.id); toast('Đã xoá góp ý.'); } catch (error) {
      console.error(error);
      list.splice(at, 0, note);
      putNote(talk, note);
      refresh(talk);
      toast('Chưa xoá được. Thử lại nhé.');
    }
  }

  // A tag tap keeps the keyboard up: the button never takes focus from the box.
  root.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-note-tag]')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b) || !talkOf(b)) return;
    const talk = talkOf(b);
    const d = b.dataset;
    if ('talkToggle' in d) {
      const open = !talk.classList.contains('is-open');
      talk.classList.toggle('is-open', open);
      b.setAttribute('aria-expanded', String(open));
    } else if ('talkOlder' in d) {
      talk.classList.add('show-old');
      b.remove();
    } else if (d.noteTag) {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      syncForm(b.form ?? b.closest('form'));
    } else if (d.noteDel) remove(talk, d.noteDel);
    else if (d.noteRetry) {
      const note = listOf(talk).find((x) => String(x.id) === d.noteRetry);
      if (!note) return;
      Object.assign(note, { failed: false, pending: true });
      putNote(talk, note);
      deliver(talk, note);
    }
  });
  root.addEventListener('input', (e) => {
    const area = e.target.closest('.talk-form textarea');
    if (!area) return;
    grow(area);
    syncForm(area.form);
  });
  // On a computer Enter sends and Shift+Enter starts a new line; on a phone Enter is a new line and the button sends.
  root.addEventListener('keydown', (e) => {
    const area = e.target.closest('.talk-form textarea');
    if (!area || e.key !== 'Enter' || e.shiftKey || e.isComposing || touch()) return;
    e.preventDefault();
    send(area.form);
  });
  root.addEventListener('submit', (e) => {
    if (!e.target.matches('.talk-form')) return;
    e.preventDefault();
    send(e.target);
  });
}
