import { askFeedbackChat, recordEvent } from '../data.js?v=20261012t';
import { chatRows, formAnswers, shuffled, wireChanges } from '../lib/chat.js?v=20261012t';
import { REASONS, PART_LABEL } from '../lib/edits.js';
import { wordDiff } from '../lib/diff.js';
import { esc, toast, firstLine } from '../ui.js?v=20261012t';

// The feedback chat (docs/plans/2026-10-12-feedback-chat-v2.md), laid out like ChatGPT on a phone and a computer
// (Nam, 2026-10-12). The bot asks in rounds; the phone shows a round one question at a time with no wait between
// them, each with tap answers above the composer. Her answers are saved after every round, so closing never loses
// them. A summary she confirms ends the chat. Without the bot, the old reason chips take over in the same screen.
// deps.ask and deps.save stand in for the Edge Function and the event queue in tests/fixtures/chat-fixture.html.

const CSS_HREF = 'css/chat.css?v=20261012t';
const MAX_REGEN = 2;
const UNSURE = 'Không rõ';
const WHERE = { portal: 'sửa trong Studio', posted: 'sửa khi đăng' };
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  menu: svg('<path d="M4 8h16M4 16h10"/>'),
  side: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  stop: svg('<rect x="5" y="5" width="14" height="14" rx="2.5"/>'),
  regen: svg('<path d="M20 11.5A8 8 0 1 0 17.7 17"/><path d="M20 5v6.5h-6.5"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};

let cssReady = null;
function loadCss() {
  cssReady ??= new Promise((done) => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: CSS_HREF });
    link.onload = done;
    link.onerror = done;
    document.head.append(link);
    setTimeout(done, 2000);
  });
  return cssReady;
}

const words = (text) => esc(text).split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : `<span class="gpt-w" style="--i:${i >> 1}">${w}</span>`)).join('');
const partName = (part) => (PART_LABEL[part] ?? part).toLowerCase();
const changedWhat = (entry) => [...new Set(entry.changes.map((c) => partName(c.part)))].join(', ');

// One quote per part she changed: the whole part with removed words struck and new words lit, or, for a rewrite,
// the old text above hers.
function quoteHtml(changes) {
  const [c] = changes;
  const head = `<figcaption>${esc(PART_LABEL[c.part] ?? c.part)} · ${esc(WHERE[c.source] ?? '')}</figcaption>`;
  const body = changes.some((x) => x.whole)
    ? `<span class="lbl">Bản cũ</span><div class="t clamp was">${esc(c.part_before ?? c.before)}</div><span class="lbl">Bạn sửa thành</span><div class="t clamp">${esc(c.part_after ?? c.after)}</div>`
    : `<div class="t clamp">${wordDiff(c.part_before ?? c.before, c.part_after ?? c.after).map((p) => (p.type === 'same' ? esc(p.text)
      : p.type === 'del' ? `<del>${esc(p.text)}</del>` : `<ins>${esc(p.text)}</ins>`)).join('')}</div>`;
  return `<figure class="gpt-quote">${head}${body}<button type="button" class="gpt-more" hidden>Xem hết</button></figure>`;
}

function shellHtml() {
  return `<aside class="gpt-side" aria-label="Các bài cần kể">
      <div class="gpt-side-top"><span class="gpt-side-title">Kể lý do sửa</span>
        <button type="button" class="gpt-icon" data-side aria-label="Đóng danh sách">${ICON.side}</button></div>
      <nav class="gpt-list"></nav></aside>
    <div class="gpt-scrim" data-side></div>
    <section class="gpt-main">
      <header class="gpt-top">
        <button type="button" class="gpt-icon" data-side data-open aria-label="Mở danh sách bài">${ICON.menu}</button>
        <div class="gpt-title"><b></b></div>
        <button type="button" class="gpt-icon" data-close aria-label="Đóng">${ICON.close}</button>
      </header>
      <div class="gpt-scroll"><div class="gpt-thread" aria-live="polite"></div></div>
      <footer class="gpt-foot">
        <button type="button" class="gpt-down" aria-label="Xuống cuối">${ICON.down}</button>
        <div class="gpt-chips" role="group" aria-label="Câu trả lời gợi ý"></div>
        <form class="gpt-composer"><label class="sr-only" for="gpt-input">Câu trả lời của bạn</label>
          <textarea id="gpt-input" rows="1" maxlength="1000" placeholder="Trả lời…" enterkeyhint="send"></textarea>
          <button type="submit" class="gpt-send" aria-label="Gửi" disabled>${ICON.up}</button></form>
        <p class="gpt-disclaim">Câu trả lời của bạn giúp bài sau viết đúng ý hơn. Máy có thể hỏi chưa trúng.</p>
      </footer>
    </section>`;
}

export async function openChat({ entry, card = null, entries = [], cards = new Map(), done = [], onSaved = () => {}, deps = {} }) {
  const ask = deps.ask ?? askFeedbackChat;
  const save = deps.save ?? ((e, payload) => recordEvent({ type: 'answered', assignment_id: e.assignment_id, card_id: e.card_id, payload }));
  await loadCss();
  document.querySelector('.gpt')?.remove();
  const before = document.activeElement;
  const root = document.createElement('div');
  root.className = 'gpt';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Kể lý do sửa');
  if (deps.theme) root.dataset.theme = deps.theme;
  root.innerHTML = shellHtml();
  document.body.append(root);
  document.documentElement.classList.add('gpt-lock');
  const $ = (s) => root.querySelector(s);
  const thread = $('.gpt-thread');
  const scroller = $('.gpt-scroll');
  const chips = $('.gpt-chips');
  const form = $('.gpt-composer');
  const input = $('textarea');
  const send = $('.gpt-send');
  const down = $('.gpt-down');
  const wide = matchMedia('(min-width: 900px)');

  // The browser's bar color follows the chat, and back closes it.
  const meta = document.querySelector('meta[name="theme-color"]');
  const oldTheme = meta?.content;
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--g-bg').trim() || '#ffffff';
  const token = `gpt-${Date.now()}`;
  history.pushState({ gpt: token }, '');
  // The keyboard on a phone shrinks the visual viewport; the chat follows it so the composer stays in sight.
  const vv = window.visualViewport;
  const fit = () => { if (!vv) return; root.style.height = `${vv.height}px`; root.style.top = `${vv.offsetTop}px`; };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();

  let pending = [...entries.filter((e) => e.assignment_id !== entry.assignment_id)];
  let finished = [...done];
  let chat = null;
  let closed = false;

  /* ---------- Thread helpers ---------- */
  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
  const toBottom = (force = false) => { if (force || nearBottom()) requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; }); };
  scroller.addEventListener('scroll', () => down.classList.toggle('show', !nearBottom()), { passive: true });
  down.onclick = () => { scroller.scrollTop = scroller.scrollHeight; };
  function add(html, cls = 'bot') {
    const el = document.createElement('div');
    el.className = `gpt-msg ${cls}`;
    el.innerHTML = html;
    thread.append(el);
    el.querySelectorAll('.gpt-quote').forEach((q) => {
      const more = q.querySelector('.gpt-more');
      const clamps = [...q.querySelectorAll('.clamp')];
      requestAnimationFrame(() => {
        if (clamps.some((c) => c.scrollHeight > c.clientHeight + 2)) {
          more.hidden = false;
          more.onclick = () => { q.classList.add('open'); more.remove(); };
        }
      });
    });
    toBottom(true);
    return el;
  }
  const addMe = (text) => add(`<div class="gpt-bubble">${esc(text)}</div>`, 'me');
  function thinking() {
    const el = add('<div class="gpt-thinking" role="status"><span class="gpt-dot"></span><span class="gpt-shimmer">Đang nghĩ</span></div>');
    const timer = setTimeout(() => el.querySelector('.gpt-thinking')?.classList.add('long'), 3500);
    return () => { clearTimeout(timer); el.remove(); };
  }
  function setChips(list) {
    chips.innerHTML = list.map((c, i) => `<button type="button" class="gpt-chip${c.cls ? ` ${c.cls}` : ''}" style="--i:${i}" data-i="${i}"${c.toggle ? ' aria-pressed="false"' : ''}>${c.icon ?? ''}${esc(c.label)}</button>`).join('');
    chips.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => list[Number(b.dataset.i)].onClick(b); });
    chips.scrollLeft = 0;
  }
  // The composer has one job at a time: `on` receives the text when she sends, `canSend` says when the button wakes
  // (some typed text, unless the job says otherwise), and `busy` turns the button into ChatGPT's stop square.
  const typed = () => Boolean(input.value.trim());
  let job = { on: null, canSend: typed, busy: false };
  const refresh = () => { send.disabled = !job.busy && !(job.on && job.canSend()); };
  function composer({ placeholder = 'Trả lời…', on = null, busy = false, canSend = typed } = {}) {
    job = { on, canSend, busy };
    input.placeholder = placeholder;
    input.disabled = !on && !busy;
    send.classList.toggle('stop', busy);
    send.innerHTML = busy ? ICON.stop : ICON.up;
    send.setAttribute('aria-label', busy ? 'Dừng' : 'Gửi');
    refresh();
  }
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 208)}px`; };
  input.addEventListener('input', () => { grow(); refresh(); });
  // Enter sends on a computer; on a phone it makes a new line, and the button sends. A Vietnamese input method is
  // still composing while isComposing is true, so Enter then only finishes the word. While the bot works, Enter waits.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !wide.matches) return;
    e.preventDefault();
    if (!job.busy) form.requestSubmit();
  });
  form.addEventListener('click', (e) => { if (e.target === form) input.focus(); });
  form.onsubmit = (e) => {
    e.preventDefault();
    if (job.busy) { chat?.stop(); return; }
    if (!job.on || !job.canSend()) return;
    const text = input.value.trim();
    input.value = '';
    grow();
    job.on(text);
  };

  /* ---------- Sidebar ---------- */
  const setSide = (open) => {
    if (wide.matches) root.classList.toggle('side-hidden', open === undefined ? !root.classList.contains('side-hidden') : !open);
    else root.classList.toggle('side-open', open === undefined ? !root.classList.contains('side-open') : open);
  };
  root.querySelectorAll('[data-side]').forEach((b) => { b.onclick = () => setSide(); });
  function paintSide(current) {
    const title = (cardId, fallback) => firstLine(cards.get(cardId)?.op ?? fallback ?? '', 60) || 'Bài đã sửa';
    const item = (attrs, head, sub, on) => `<button type="button" class="gpt-item" ${attrs}${on ? ' aria-current="true"' : ''}><b>${esc(head)}</b><small>${esc(sub)}</small></button>`;
    const now = chat?.entry;
    const todo = now && !chat.viewOnly && !chat.done ? [now, ...pending] : pending;
    root.querySelector('.gpt-list').innerHTML = `<p class="gpt-list-h">Cần kể · ${todo.length}</p>
      ${todo.length ? todo.map((e) => item(`data-todo="${esc(e.assignment_id)}"`, title(e.card_id, e.changes[0]?.before), `Đã sửa ${changedWhat(e)}`, current === e.assignment_id)).join('') : '<p class="gpt-list-empty">Đã kể hết. Cảm ơn bạn.</p>'}
      ${finished.length ? `<p class="gpt-list-h">Đã kể</p>${finished.map((d) => item(`data-done="${esc(d.chat_id)}"`, title(d.card_id), d.lessons[0] ?? 'Đã lưu', current === d.chat_id)).join('')}` : ''}`;
    root.querySelectorAll('[data-todo]').forEach((b) => { b.onclick = () => {
      if (!wide.matches) setSide(false);
      const next = todo.find((e) => e.assignment_id === b.dataset.todo);
      if (next && next !== chat?.entry) startChat(next);
    }; });
    root.querySelectorAll('[data-done]').forEach((b) => { b.onclick = () => {
      if (!wide.matches) setSide(false);
      viewChat(finished.find((d) => d.chat_id === b.dataset.done));
    }; });
  }

  /* ---------- One chat ---------- */
  // A chat she leaves with no answer goes back to Cần kể; one with saved answers counts as explained.
  function startChat(next) {
    chat?.leave();
    if (chat && !chat.viewOnly && !chat.done && chat.entry !== next && !pending.includes(chat.entry)) pending = [chat.entry, ...pending];
    pending = pending.filter((e) => e !== next);
    chat = runChat(next);
    paintSide(next.assignment_id);
  }
  function viewChat(d) {
    chat?.leave();
    if (chat && !chat.viewOnly && !chat.done && !pending.includes(chat.entry)) pending = [chat.entry, ...pending];
    chat = { viewOnly: true, leave() {}, stop() {} };
    thread.innerHTML = '';
    root.classList.add('ended');
    $('.gpt-title b').textContent = firstLine(cards.get(d.card_id)?.op ?? '', 80) || 'Bài đã kể';
    for (const t of d.transcript) {
      if (t.role === 'bot' && t.questions) {
        if (t.say) add(`<p>${esc(t.say)}</p>`);
        // Her answers sit in the next member turn; each question shows with its answer below it.
        const reply = d.transcript[d.transcript.indexOf(t) + 1];
        for (const q of t.questions) {
          add(`<p>${esc(q.text)}</p>`);
          const a = reply?.answers?.find((x) => x.question_id === q.id);
          if (a) addMe(a.text);
        }
      } else if (t.role === 'bot' && t.summary) {
        add(`<p>${esc(t.say)}</p><ul>${t.summary.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>`);
      } else if (t.role === 'member' && t.amend) addMe(t.amend);
    }
    add(`<p class="gpt-saved">${ICON.check}${d.confirmed === true ? 'Bạn đã xác nhận' : 'Đã lưu'}</p>`);
    setChips(pending.length ? [{ label: `Bài tiếp theo · còn ${pending.length}`, cls: 'primary', onClick: () => startChat(pending[0]) }] : [{ label: 'Xong', onClick: () => close() }]);
    paintSide(d.chat_id);
  }

  function runChat(e) {
    const c = e.card_id ? cards.get(e.card_id) ?? (e === entry ? card : null) : null;
    const state = { entry: e, viewOnly: false, saved: false, done: false, turns: [], tree: [], summary: [], model: null, chatId: crypto.randomUUID(),
      round: null, askId: 0, regen: MAX_REGEN, stopped: null, leave, stop };
    thread.innerHTML = '';
    root.classList.remove('ended');
    $('.gpt-title b').textContent = firstLine(c?.op ?? e.changes[0]?.before ?? '', 80) || 'Kể lý do sửa';
    const shown = new Set();
    const byId = new Map(e.changes.map((x) => [x.id, x]));

    async function persist({ final = false, confirmed = null } = {}) {
      const rows = chatRows({ entry: e, tree: state.tree, summary: state.summary, turns: state.turns, model: state.model, chatId: state.chatId,
        final, confirmed, writerVersion: c?.writer_version ?? null });
      try {
        for (const payload of rows) await save(e, payload);
        state.saved = true;
        onSaved();
      } catch { toast('Chưa lưu được. Kiểm tra mạng rồi thử lại nhé.'); }
    }

    async function askBot(extra = {}) {
      const id = ++state.askId;
      setChips([]);
      composer({ busy: true });
      const stopThinking = thinking();
      let res = null;
      let why = '';
      try {
        res = await ask({ assignment_id: e.assignment_id, card_id: e.card_id, changes: wireChanges(e), turns: state.turns, cards_waiting: pending.length, ...extra });
      } catch (err) { why = err?.message ?? 'no reply'; }
      if (id !== state.askId || closed || chat !== state) return;
      stopThinking();
      if (!res?.reply) { fallback(why || 'no reply'); return; }
      state.model = res.model ?? state.model;
      if (res.reply.tree?.length) state.tree = res.reply.tree;
      if (res.reply.done) showSummary(res.reply);
      else startRound(res.reply);
    }
    function stop() {
      state.askId += 1;
      thread.querySelector('.gpt-thinking')?.closest('.gpt-msg')?.remove();
      add('<p class="gpt-note-line">Đã dừng.</p>');
      composer({});
      setChips([{ label: 'Hỏi lại', icon: ICON.regen, onClick: () => askBot(state.stopped ?? {}) }]);
    }

    function startRound(reply) {
      const els = [];
      state.round = { questions: reply.questions, i: 0, answers: [], els };
      state.turns.push({ role: 'bot', say: reply.say, questions: reply.questions });
      if (reply.say) els.push(add(`<p>${words(reply.say)}</p>`));
      showQuestion();
    }
    function showQuestion() {
      const r = state.round;
      const q = r.questions[r.i];
      // A part she changed is quoted the first time a question is about it.
      const fresh = q.change_ids.map((id) => byId.get(id)).filter((x) => x && !shown.has(x.id));
      fresh.forEach((x) => shown.add(x.id));
      const groups = [...fresh.reduce((m, x) => m.set(`${x.part}.${x.source}`, [...(m.get(`${x.part}.${x.source}`) ?? []), x]), new Map()).values()];
      const canRegen = r.i === 0 && state.regen > 0;
      const el = add(`${groups.map(quoteHtml).join('')}<p>${words(q.text)}</p>
        ${canRegen ? `<div class="gpt-acts"><button type="button" class="gpt-icon" data-regen aria-label="Hỏi cách khác" title="Hỏi cách khác">${ICON.regen}</button></div>` : ''}`);
      r.els.push(el);
      el.querySelector('[data-regen]')?.addEventListener('click', regen);
      const options = shuffled(q.options);
      setChips([
        ...options.map((o) => ({ label: o.label, onClick: () => answer({ via: 'tap', text: o.label, guess: o.guess }) })),
        { label: UNSURE, cls: 'quiet', onClick: () => answer({ via: 'unsure', text: UNSURE, guess: null }) },
      ]);
      composer({ placeholder: options.length ? 'Hoặc gõ lý do của bạn…' : 'Trả lời…', on: (text) => answer({ via: 'type', text, guess: null }) });
    }
    function regen() {
      const r = state.round;
      if (!r || r.answers.length || state.regen <= 0) return;
      state.regen -= 1;
      r.els.forEach((x) => x.remove());
      r.questions.flatMap((q) => q.change_ids).forEach((id) => shown.delete(id));
      state.turns.pop();
      state.round = null;
      state.stopped = { regen_of: r.questions };
      askBot({ regen_of: r.questions });
    }
    function answer(a) {
      const r = state.round;
      const q = r.questions[r.i];
      r.els.forEach((x) => x.querySelector('.gpt-acts')?.remove());
      r.answers.push({ question_id: q.id, ...a });
      addMe(a.text);
      setChips([]);
      r.i += 1;
      if (r.i < r.questions.length) {
        composer({});
        const stopThinking = thinking();
        setTimeout(() => { if (chat !== state || state.round !== r) return; stopThinking(); showQuestion(); }, 450);
        return;
      }
      state.turns.push({ role: 'member', answers: r.answers });
      state.round = null;
      state.stopped = {};
      void persist();
      askBot();
    }

    function showSummary(reply) {
      state.summary = reply.summary ?? [];
      state.turns.push({ role: 'bot', say: reply.say, summary: state.summary });
      const amended = state.turns.some((t) => t.role === 'member' && t.amend);
      if (!state.summary.length) {
        add(`<p>${words(reply.say || 'Cảm ơn bạn nha.')}</p>`);
        finish({ confirmed: null });
        return;
      }
      add(`<p>${words(reply.say)}</p><ul>${state.summary.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>${amended ? '' : '<p>Đúng ý bạn chưa?</p>'}`);
      if (amended) { finish({ confirmed: 'amended' }); return; }
      void persist({ final: true });
      setChips([
        { label: 'Đúng rồi', icon: ICON.check, cls: 'primary', onClick: () => { addMe('Đúng rồi'); finish({ confirmed: true }); } },
        { label: 'Chưa đúng', onClick: () => { setChips([]); composer({ placeholder: 'Chỗ nào chưa đúng?', on: amend }); input.focus(); } },
      ]);
      composer({ placeholder: 'Chỗ nào chưa đúng thì gõ ở đây…', on: amend });
    }
    function amend(text) {
      addMe(text);
      state.turns.push({ role: 'member', amend: text });
      state.stopped = {};
      askBot();
    }
    async function finish({ confirmed }) {
      state.done = true;
      setChips([]);
      composer({});
      await persist({ final: true, confirmed });
      if (chat !== state) return;
      add(`<p class="gpt-saved">${ICON.check}Đã lưu</p>`);
      finished = [{ chat_id: state.chatId, card_id: e.card_id, assignment_id: e.assignment_id, at: new Date().toISOString(), final: true, confirmed,
        transcript: state.turns, lessons: state.summary.map((l) => l.text) }, ...finished];
      paintSide(state.chatId);
      ended();
    }
    function ended() {
      root.classList.add('ended');
      setChips(pending.length
        ? [{ label: `Bài tiếp theo · còn ${pending.length}`, cls: 'primary', onClick: () => startChat(pending[0]) }, { label: 'Xong', onClick: () => close() }]
        : [{ label: 'Xong', cls: 'primary', onClick: () => close() }]);
    }

    // The old reason chips, one answer for the whole card, when the bot is not reachable. The grey line says why.
    function fallback(why) {
      state.askId += 1;
      add(`<p>${words('Máy chưa trả lời được. Bạn chọn nhanh lý do cho các chỗ đã sửa nha, chọn nhiều cũng được.')}</p>
        <p class="gpt-note-line">Mã lỗi: ${esc(String(why).slice(0, 240))}</p>`);
      const picked = new Set();
      setChips(REASONS.filter(([code]) => code !== 'other').map(([code, label]) => ({ label, toggle: true, onClick: (b) => {
        if (picked.has(code)) picked.delete(code); else picked.add(code);
        b.setAttribute('aria-pressed', String(picked.has(code)));
        refresh();
      } })));
      composer({ placeholder: 'Nói thêm nếu muốn, rồi bấm gửi', canSend: () => picked.size > 0 || typed(), on: async (note) => {
        const labels = REASONS.filter(([code]) => picked.has(code)).map(([, label]) => label);
        addMe([...labels, note].filter(Boolean).join(' · '));
        setChips([]);
        composer({});
        try {
          for (const payload of formAnswers({ entry: e, reasons: [...picked], words: note, nextTime: null })) await save(e, payload);
          state.saved = true;
          state.done = true;
          onSaved();
          add(`<p class="gpt-saved">${ICON.check}Đã lưu</p>`);
          ended();
        } catch { toast('Chưa lưu được. Thử lại nhé.'); }
      } });
    }

    // Leaving mid-round keeps what she already answered in this round.
    function leave() {
      state.askId += 1;
      const r = state.round;
      const answeredNow = Boolean(r?.answers.length);
      if (answeredNow) {
        state.turns.push({ role: 'member', answers: r.answers });
        state.round = null;
        void persist();
      }
      if ((state.saved || answeredNow || state.turns.some((t) => t.role === 'member')) && !state.done) {
        state.done = true;
        finished = [{ chat_id: state.chatId, card_id: e.card_id, assignment_id: e.assignment_id, at: new Date().toISOString(), final: false,
          confirmed: null, transcript: state.turns, lessons: [] }, ...finished];
      }
    }

    askBot();
    return state;
  }

  /* ---------- Open and close ---------- */
  function teardown() {
    if (closed) return;
    closed = true;
    chat?.leave();
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    if (meta && oldTheme) meta.content = oldTheme;
    document.documentElement.classList.remove('gpt-lock');
    root.remove();
    before?.focus?.({ preventScroll: true });
  }
  function close() {
    if (history.state?.gpt === token) history.back();
    else teardown();
  }
  function onPop() { teardown(); }
  function onKey(e) {
    if (e.key !== 'Escape' || (e.target === input && input.value)) return;
    if (root.classList.contains('side-open')) setSide(false);
    else close();
  }
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);
  $('[data-close]').onclick = close;
  root.focus({ preventScroll: true });
  chat = runChat(entry);
  paintSide(entry.assignment_id);
  return { close };
}
