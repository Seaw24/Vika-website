// The Insights composer (Nam, 2026-11-07): one form for the Insights chat, the bar under Kho bài's hero, the quick sheet
// of the floating button on every other Threads page, and editing her own note. She writes the moment the idea comes:
// one draft is shared by every composer and survives a reload, the two default tags are one tap, a #word in the text
// becomes a tag, and the card open on her screen goes with the note. On a computer Enter sends and Shift Enter makes a
// new line, as in a chat; on a phone the keyboard's Enter makes a new line and the button sends.
import { loadIntuitions, addIntuition, editIntuition } from '../data.js?v=20261113a';
import { DEFAULT_TAGS, MAX_TAGS, MAX_BODY, tagLabel, takeHashtags, hashAtCaret, suggestTags, tagCounts, resolveTag, normalizeTag,
  splitThreads, unseenCounts, replyNews } from '../lib/intuitions.js?v=20261113a';
import { esc, icon, face, toast, firstLine, draftStore } from '../ui.js?v=20261113a';

// One draft for every new-note composer; each thread's reply box keeps its own.
const draftKey = (key = null) => (key ? `intuition.${key}` : 'intuition');
const readDraft = (key = null) => { try { return JSON.parse(draftStore.get(draftKey(key)) ?? 'null') ?? {}; } catch { return {}; } };
const writeDraft = (d, key = null) => (d.body?.trim() || d.tags?.length ? draftStore.set(draftKey(key), JSON.stringify(d)) : draftStore.drop(draftKey(key)));
// Which draft a composer keeps: the one shared draft, a thread's (reply.<note>) or a feedback's turned into a note (from.<id>).
const draftOf = (parentId, draft) => draft ?? (parentId ? `reply.${parentId}` : null);
const finePointer = () => typeof matchMedia === 'function' && matchMedia('(hover:hover) and (pointer:fine)').matches;
let serial = 0;
// Every tag the team has used, for suggestions; read once a page.
let knownTags = DEFAULT_TAGS.map((t) => t.key);
export function learnTags(list) { knownTags = tagCounts(list).map((t) => t.key); }
const loadKnown = () => loadIntuitions().then(learnTags).catch(() => {});

const chip = (key, on) => `<button type="button" class="jot-chip${DEFAULT_TAGS.some((t) => t.key === key) ? ' is-default' : ''}" data-tag="${esc(key)}" aria-pressed="${on}">
  <span class="jot-hash">#</span>${esc(tagLabel(key))}</button>`;

// variant: chat (the Insights page), inline (Kho bài), sheet, reply (a thread's box) or edit. card: { id, op } of the
// card on her screen. A reply, and the edit of a reply, carry no tags.
export function composerHtml(ctx, { variant = 'chat', card = null, initial = null, placeholder = null, parentId = null, draft = null, prefill = null, prefillTags = [] } = {}) {
  const n = ++serial;
  const edit = variant === 'edit';
  const bare = variant === 'reply' || (edit && initial?.parent_id);
  const dk = draftOf(parentId, draft);
  const saved = edit ? null : readDraft(dk);
  // A prefilled box (a feedback turned into a note) starts from the feedback until she changes it.
  const d = edit ? initial : saved.body ? saved : prefill ? { body: prefill, tags: prefillTags } : saved;
  const tags = [...new Set([...DEFAULT_TAGS.map((t) => t.key), ...(d.tags ?? [])])];
  const ph = placeholder ?? (variant === 'inline' ? 'Vừa nhận ra điều gì? Ghi lại một insight…' : 'Bạn nhận ra điều gì khi chọn bài, viết bài hay dùng app?');
  const avatar = variant === 'inline' || variant === 'sheet';
  return `<form class="jot jot--${variant}${bare ? ' is-bare' : ''}${d.body ? ' is-open' : ''}" novalidate data-jot>
    ${avatar ? `<div class="jot-av">${face(ctx.me)}</div>` : ''}
    <div class="jot-main">
      <label class="sr-only" for="jot-${n}">${edit ? 'Sửa insight' : 'Insight của bạn'}</label>
      <textarea id="jot-${n}" class="jot-text" rows="1" maxlength="${MAX_BODY}" placeholder="${esc(ph)}" enterkeyhint="enter">${esc(d.body ?? '')}</textarea>
      <div class="jot-suggest" role="listbox" aria-label="Chọn thẻ" hidden></div>
      ${card && !edit ? `<p class="jot-card" data-card="${esc(card.id)}">${icon('stack')}<span>Gắn với bài: <b>${esc(firstLine(card.op, 56))}</b></span>
        <button type="button" class="jot-card-x" data-uncard aria-label="Bỏ gắn bài">${icon('close')}</button></p>` : ''}
      <div class="jot-foot">
        ${bare ? '<div class="jot-tags"></div>' : `<div class="jot-tags" role="group" aria-label="Thẻ của insight">
          ${tags.map((t) => chip(t, (d.tags ?? []).includes(t))).join('')}
          <button type="button" class="jot-chip jot-add" data-addtag>${icon('plus')}<span>Thẻ khác</span></button>
          <input class="jot-newtag" type="text" maxlength="24" placeholder="Tên thẻ, Enter để thêm" aria-label="Tên thẻ mới" hidden>
        </div>`}
        <div class="jot-go">
          <span class="jot-count" aria-live="polite"></span>
          <span class="jot-key"><kbd>Enter</kbd> gửi · <kbd>Shift</kbd><kbd>Enter</kbd> xuống dòng</span>
          ${edit ? '<button type="button" class="btn btn-line sm" data-cancel>Huỷ</button>' : ''}
          <button type="submit" class="jot-send${edit ? ' btn btn-gold sm' : ''}" disabled aria-label="${edit ? 'Lưu' : 'Gửi'}">${edit ? `${icon('check')}<span>Lưu</span>` : icon('send')}</button>
        </div>
      </div>
    </div>
  </form>`;
}

// onSent(row) after a new note posts. onPending(row) runs the moment she sends, with the note as it will look;
// onFailed(clientId) if it did not post, and her text goes back into the box. onSaved(row) and onCancel for an edit.
export function wireComposer(form, ctx, { variant = 'chat', card = null, initial = null, onSent = () => {}, onPending = null, onFailed = () => {},
  onSaved = () => {}, onCancel = () => {}, onFocus = () => {}, onBlur = () => {}, parentId = null, draft = null } = {}) {
  const dk = draftOf(parentId, draft);
  const edit = variant === 'edit';
  const area = form.querySelector('.jot-text');
  const send = form.querySelector('.jot-send');
  const count = form.querySelector('.jot-count');
  const suggest = form.querySelector('.jot-suggest');
  const newTag = form.querySelector('.jot-newtag');
  const tagsBox = form.querySelector('.jot-tags');
  let cardId = card?.id ?? null;
  const bare = variant === 'reply' || Boolean(edit && initial?.parent_id);
  // A reply keeps its #words as written; only a note turns them into tags.
  const parse = (text) => (bare ? { body: text.trim(), tags: [] } : takeHashtags(text, knownTags));
  let clientId = edit ? null : readDraft(dk).client_id ?? null;
  let busy = false;
  let pick = 0;
  if (!edit && !bare) loadKnown();
  form.classList.toggle('fine', finePointer());

  const picked = () => [...form.querySelectorAll('.jot-chip[aria-pressed="true"]')].map((b) => b.dataset.tag);
  const fit = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };
  function sync() {
    const len = area.value.length;
    send.disabled = busy || !parse(area.value).body;
    count.textContent = len > MAX_BODY - 200 ? `${MAX_BODY - len}` : '';
    form.classList.toggle('is-open', document.activeElement === area || Boolean(area.value.trim()) || edit);
    form.classList.toggle('has-text', Boolean(area.value.trim()));
    if (!edit) writeDraft({ body: area.value, tags: picked(), client_id: clientId }, dk);
  }
  function addChip(key, on = true) {
    let b = tagsBox.querySelector(`.jot-chip[data-tag="${CSS.escape(key)}"]`);
    if (on && b?.getAttribute('aria-pressed') !== 'true' && picked().length >= MAX_TAGS) { toast(`Mỗi insight có tối đa ${MAX_TAGS} thẻ.`); return; }
    if (!b) {
      form.querySelector('[data-addtag]').insertAdjacentHTML('beforebegin', chip(key, on));
      b = form.querySelector(`.jot-chip[data-tag="${CSS.escape(key)}"]`);
    } else b.setAttribute('aria-pressed', String(on));
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    sync();
  }
  // The tags of the open channel go on the note, unless she picked her own.
  function setTags(keys) {
    if (edit || picked().some((k) => !keys.includes(k)) && area.value.trim()) return;
    form.querySelectorAll('.jot-chip[data-tag]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    keys.slice(0, MAX_TAGS).forEach((k) => addChip(k));
    sync();
  }
  function clearBox() {
    area.value = '';
    form.querySelectorAll('.jot-chip:not(.is-default):not(.jot-add)').forEach((b) => b.remove());
    form.querySelectorAll('.jot-chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    fit();
  }

  // # at the caret opens the tag list; a tap or Enter puts the tag on and takes the #word out of the text.
  function paintSuggest() {
    if (bare) return;
    const at = hashAtCaret(area.value, area.selectionStart);
    if (!at) { suggest.hidden = true; return; }
    const list = suggestTags(at.word, knownTags.filter((k) => !picked().includes(k)));
    const fresh = normalizeTag(at.word);
    const items = [...list.map((k) => ({ key: k, label: tagLabel(k), make: false })),
      ...(fresh && !knownTags.some((k) => resolveTag(fresh, [k]) === k) ? [{ key: fresh, label: `Tạo thẻ “${tagLabel(fresh)}”`, make: true }] : [])];
    if (!items.length) { suggest.hidden = true; return; }
    pick = Math.min(pick, items.length - 1);
    suggest.innerHTML = `<p class="jot-suggest-h">Thẻ</p>${items.map((x, i) => `<button type="button" role="option" class="jot-opt${x.make ? ' is-make' : ''}" data-pick="${esc(x.key)}" aria-selected="${i === pick}">
      ${x.make ? icon('plus') : '<span class="jot-hash">#</span>'}${esc(x.label)}</button>`).join('')}`;
    suggest.hidden = false;
  }
  function applyPick(key) {
    const at = hashAtCaret(area.value, area.selectionStart);
    if (at) {
      area.value = `${area.value.slice(0, at.start)}${area.value.slice(at.end)}`.replace(/[ \t]{2,}/g, ' ');
      area.setSelectionRange(at.start, at.start);
    }
    if (!knownTags.includes(key)) knownTags = [...knownTags, key];
    addChip(key);
    suggest.hidden = true;
    pick = 0;
    fit();
    area.focus();
  }

  async function submit() {
    if (busy) return;
    const { body, tags: typed } = parse(area.value);
    if (!body) { area.focus(); return; }
    const tags = [...new Set([...picked(), ...typed])].slice(0, MAX_TAGS);
    if (edit) {
      busy = true;
      send.classList.add('is-busy');
      sync();
      try { onSaved(await editIntuition(initial.id, { body, tags })); } catch (error) {
        console.error(error);
        toast('Chưa lưu được. Kiểm tra mạng rồi thử lại.');
      }
      busy = false;
      send.classList.remove('is-busy');
      sync();
      return;
    }
    clientId ??= crypto.randomUUID();
    const id = clientId;
    const snapshot = { text: area.value, tags: picked() };
    // A chat clears the box at once and shows the note as sending; if it fails, the text comes back into the box.
    // The other composers keep the text and the draft until the database has the note.
    if (onPending) {
      clearBox();
      clientId = null;
      draftStore.drop(draftKey(dk));
      sync();
      onPending({ id: `pending-${id}`, client_id: id, member_id: ctx.me.id, parent_id: parentId, body, tags, card_id: cardId, created_at: new Date().toISOString(),
        edited_at: null, read_at: null, outcome: null, outcome_note: null, agrees: [], reactions: [], pending: true });
    } else {
      writeDraft({ body: snapshot.text, tags: snapshot.tags, client_id: id }, dk);
      busy = true;
      send.classList.add('is-busy');
      sync();
    }
    try {
      const row = await addIntuition({ client_id: id, body, tags, card_id: cardId, parent_id: parentId });
      const stored = readDraft(dk);
      if (!stored.client_id || stored.client_id === id) draftStore.drop(draftKey(dk));
      if (!onPending) { clearBox(); clientId = null; }
      window.dispatchEvent(new CustomEvent('studio:intuition', { detail: row }));
      onSent(row);
    } catch (error) {
      console.error(error);
      // A thread repaints its box while the reply sends, so the text goes into the draft the new box reads.
      if (!area.isConnected) writeDraft({ body: snapshot.text, tags: [], client_id: id }, dk);
      onFailed(id);
      if (area.isConnected && !area.value.trim()) {
        area.value = snapshot.text;
        snapshot.tags.forEach((k) => addChip(k));
        clientId = id;
        fit();
      }
      toast('Chưa gửi được. Insight vẫn còn trong ô, kiểm tra mạng rồi gửi lại.');
    }
    busy = false;
    send.classList.remove('is-busy');
    if (area.isConnected) sync();
  }

  area.addEventListener('input', () => { fit(); sync(); paintSuggest(); });
  area.addEventListener('focus', () => { form.classList.add('is-open'); paintSuggest(); onFocus(); });
  area.addEventListener('blur', () => setTimeout(() => {
    if (!form.contains(document.activeElement)) { suggest.hidden = true; sync(); onBlur(); }
  }, 120));
  area.addEventListener('click', paintSuggest);
  area.addEventListener('keydown', (e) => {
    // A Vietnamese input method is still building the word: Enter belongs to it.
    if (e.isComposing || e.keyCode === 229) return;
    if (!suggest.hidden) {
      const opts = [...suggest.querySelectorAll('[data-pick]')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pick = (pick + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length;
        paintSuggest();
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); applyPick(opts[pick].dataset.pick); return; }
      if (e.key === 'Escape') { e.preventDefault(); suggest.hidden = true; return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (finePointer() && !e.shiftKey))) { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape' && edit) onCancel();
  });
  suggest.addEventListener('mousedown', (e) => e.preventDefault());
  suggest.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) applyPick(b.dataset.pick); });

  form.addEventListener('click', (e) => {
    const t = e.target.closest('.jot-chip[data-tag]');
    if (t) { addChip(t.dataset.tag, t.getAttribute('aria-pressed') !== 'true'); return; }
    if (e.target.closest('[data-addtag]')) {
      e.target.closest('[data-addtag]').hidden = true;
      newTag.hidden = false;
      newTag.focus();
      return;
    }
    if (e.target.closest('[data-uncard]')) { cardId = null; e.target.closest('.jot-card').remove(); return; }
    if (e.target.closest('[data-cancel]')) onCancel();
  });
  const closeNewTag = () => { newTag.value = ''; newTag.hidden = true; form.querySelector('[data-addtag]').hidden = false; };
  newTag?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const key = resolveTag(newTag.value, knownTags);
      if (key) { if (!knownTags.includes(key)) knownTags = [...knownTags, key]; addChip(key); }
      closeNewTag();
      area.focus();
    }
    if (e.key === 'Escape') { e.preventDefault(); closeNewTag(); area.focus(); }
  });
  newTag?.addEventListener('blur', () => {
    const key = resolveTag(newTag.value, knownTags);
    if (key) addChip(key);
    closeNewTag();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  fit();
  sync();
  form.classList.toggle('is-open', Boolean(area.value.trim()) || edit);
  return {
    focus: () => { area.focus(); area.setSelectionRange(area.value.length, area.value.length); },
    setTags,
    setPlaceholder: (text) => { area.placeholder = text; },
    // Replying to one person in a thread starts the text with her name, as on Threads.
    mention: (name) => {
      const tag = `@${name} `;
      if (!area.value.startsWith(tag)) area.value = `${tag}${area.value.replace(/^@\S+(\s\S+)?\s/, '')}`;
      fit();
      sync();
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    },
  };
}

/* ---------- The quick sheet and the floating button ---------- */

// After a note posts from outside Insights: "Xem" opens Insights at that note, so she sees it landed.
export const FOCUS = 'studio.bk.focus';
export function sentToast(row) {
  toast('Đã gửi vào Insights. Cả nhóm đã thấy.', { label: 'Xem', href: '#/insights',
    onClick: () => { try { sessionStorage.setItem(FOCUS, row.id); } catch { /* storage blocked: the chat opens at the bottom */ } } });
}

// card: the card the note is about. Without one, the card on her screen goes with it. title and lead change the
// sheet's words when Studio asks for a note (after a post).
export function openJotSheet(ctx, { card = ctx?.jotCard ?? null, title = 'Ghi lại khi còn nhớ', lead = '', prefill = null, prefillTags = [], draft = null } = {}) {
  document.querySelector('dialog.jot-sheet')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet jot-sheet';
  dialog.setAttribute('aria-labelledby', 'jot-sheet-h');
  dialog.innerHTML = `<div class="sheet-grip"></div>
    <button type="button" class="kb-sheet-x" data-x aria-label="Đóng">${icon('close')}</button>
    <p class="eyebrow">${icon('bulb')}Insights</p>
    <h2 id="jot-sheet-h">${esc(title)}</h2>
    ${lead ? `<p class="jot-sheet-lead">${esc(lead)}</p>` : ''}
    ${composerHtml(ctx, { variant: 'sheet', card, prefill, prefillTags, draft })}
    <div class="jot-sheet-foot"><a class="linkish jot-sheet-all" href="#/insights">Mở Insights của cả nhóm${icon('right')}</a>
      <span class="jot-sheet-key">Phím <kbd>N</kbd> mở ô này ở mọi trang</span></div>`;
  document.body.append(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  const c = wireComposer(dialog.querySelector('[data-jot]'), ctx, { variant: 'sheet', card, draft,
    onSent: (row) => { close(); sentToast(row); } });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-x]') || e.target.closest('.jot-sheet-all')) close();
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.showModal();
  c.focus();
}

// Right after "Đã đăng xong" a member is most likely to have an idea about that post. Studio asks once a day in
// Vietnam, with a small card above the tab bar that leaves after 12 seconds; a tap opens the sheet with the card.
const NUDGED = 'studio.bk.nudged';
export function nudgeAfterPost(ctx, card) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  try { if (localStorage.getItem(NUDGED) === today) return; localStorage.setItem(NUDGED, today); } catch { return; }
  document.querySelector('.jot-nudge')?.remove();
  const el = document.createElement('div');
  el.className = 'jot-nudge';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="jot-nudge-i">${icon('bulb')}</span><span class="jot-nudge-t"><b>Bài vừa đăng.</b> Rút ra được gì không?</span>
    <button type="button" class="btn btn-gold sm" data-go>Ghi insight</button>
    <button type="button" class="jot-nudge-x" data-x aria-label="Để sau">${icon('close')}</button>`;
  document.body.append(el);
  const leave = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); removeEventListener('hashchange', leave); };
  const timer = setTimeout(leave, 12000);
  addEventListener('hashchange', leave);
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-go]')) {
      clearTimeout(timer);
      leave();
      openJotSheet(ctx, { card, title: 'Rút ra từ bài vừa đăng', lead: 'Một dòng là đủ: bài này hay ở đâu, hoặc lần sau bạn sẽ viết hay chọn khác thế nào.' });
    }
    if (e.target.closest('[data-x]')) { clearTimeout(timer); leave(); }
  });
}

// N on a computer opens the sheet from any Threads page, or the chat's own box on Insights. It never fires while she
// types in a field, holds a modifier, or has a dialog open.
let keyOn = false;
function installKey() {
  if (keyOn) return;
  keyOn = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'n' && e.key !== 'N') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || !current?.me) return;
    const t = e.target;
    if (t?.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    const hash = location.hash || '#/';
    if (hash.startsWith('#/tiktok')) return;
    e.preventDefault();
    const box = hash === '#/insights' ? document.querySelector('.bk-dock .jot-text') : null;
    if (box) box.focus(); else openJotSheet(current);
  });
}

let fab = null;
let watch = null;
// The click opens the sheet with the ctx of the moment, so the card on her screen goes with the note.
let current = null;
// The Insights tab carries a gold count: notes from others since her last visit, plus threads with new replies to her.
// On Insights itself the count clears, because the page marks everything seen.
async function paintBadge(ctx, hash) {
  const tab = () => document.querySelector('#tabs a[href="#/insights"]');
  const set = (n) => {
    const a = tab();
    if (!a) return;
    a.querySelector('.badge')?.remove();
    if (n) a.insertAdjacentHTML('beforeend', `<span class="badge" aria-label="${n} mới">${n > 9 ? '9+' : n}</span>`);
  };
  if (hash === '#/insights') { set(0); return; }
  try {
    const all = await loadIntuitions();
    let seen = null;
    try { seen = localStorage.getItem('studio.bk.seen'); } catch { /* storage blocked */ }
    // Before her first visit, the tab stays quiet rather than counting the whole history.
    if (!seen) { set(0); return; }
    const { notes, replies } = splitThreads(all);
    set(unseenCounts(notes, seen, ctx.me.id).total + replyNews(notes, replies, seen, ctx.me.id).toMe.size);
  } catch { set(0); }
}

// main.js calls this after each page paints. The button shows on Threads pages, except Insights, which has its own
// composer, and Kho bài while its bar is on screen.
export function syncJot(ctx, hash) {
  watch?.disconnect();
  watch = null;
  current = ctx;
  // A new page closes the sheet; her text stays in the draft.
  const open = document.querySelector('dialog.jot-sheet');
  if (open) { open.close(); open.remove(); }
  if (ctx?.me) { paintBadge(ctx, hash); installKey(); }
  const on = Boolean(ctx?.me) && !String(hash).startsWith('#/tiktok') && hash !== '#/insights';
  if (!on) { fab?.remove(); fab = null; return; }
  if (!fab) {
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'jot-fab';
    fab.innerHTML = `${icon('pen')}<span>Ghi insight</span><kbd class="jot-fab-k" title="Phím tắt">N</kbd>`;
    fab.setAttribute('aria-label', 'Ghi một insight');
    fab.addEventListener('click', () => openJotSheet(current));
    document.body.append(fab);
  }
  fab.classList.toggle('has-draft', Boolean(readDraft().body?.trim()));
  fab.classList.toggle('over-dock', document.body.classList.contains('focus'));
  const bar = document.querySelector('#main .jot--inline');
  if (bar && 'IntersectionObserver' in window) {
    fab.classList.add('is-away');
    watch = new IntersectionObserver(([entry]) => fab?.classList.toggle('is-away', entry.isIntersecting), { rootMargin: '-80px 0px 0px 0px' });
    watch.observe(bar);
  } else {
    fab.classList.remove('is-away');
  }
}
