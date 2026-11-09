// Insights (Nam, 2026-11-07; migration intuitions): the team's chat of what members learn while they pick and write
// posts. Second design (Nam: "chatting between people, like Slack"): tags are channels and members are people in a
// dark side list; the chat runs oldest first with the newest note at the bottom, notes of one member a few minutes apart
// stack under one name, and the composer stays at the bottom. A click on a channel or a person opens it alone; the
// round button beside it adds it to what is open. On a phone the side list is a sheet from the chat's title.
// Third pass (Nam, same day): reactions beside Đồng ý, and replies as on Threads, folded under a note behind "N câu
// trả lời" and opened in place with a thread line; Trả lời bạn gathers the threads that answer her. Every 2 weeks the
// seat reads the new notes; its verdict shows as Vika's reply under a note, and each read is a line in the chat.
import { loadIntuitions, deleteIntuition, reactIntuition, loadCardsBrief } from '../data.js?v=20261109a';
import { DEFAULT_TAGS, PERIODS, VIEWS, REACTIONS, tagLabel, tagCounts, scopeList, stackMessages, readMarks, unseenCounts, linkify, personSummary,
  nextReadDay, unreadCount, dayLabel, timeLabel, compact, reactionSummary, splitThreads, replyNews, myThreads, GUIDE_ID } from '../lib/intuitions.js?v=20261109a';
import { vnDate, addDays } from '../lib/week.js?v=20261109a';
import { diffHtml } from './shared.js';
import { esc, icon, face, toast, firstLine, copyText } from '../ui.js?v=20261109a';
import { composerHtml, wireComposer, learnTags, sentToast, FOCUS, openJotSheet } from './jot.js?v=20261109a';

const KEY = 'studio.bk.view.v2';
export const SEEN = 'studio.bk.seen';
const CHUNK = 60;
const THREAD_TAIL = 4;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const blank = () => ({ view: 'all', people: new Set(), tags: new Set(), period: 'all', query: '' });
function readView() {
  try {
    const v = JSON.parse(store.get(KEY) ?? '{}');
    return { ...blank(), view: VIEWS.some(([k]) => k === v.view) ? v.view : 'all', people: new Set(v.people ?? []), tags: new Set(v.tags ?? []),
      period: PERIODS.some(([k]) => k === v.period) ? v.period : 'all' };
  } catch { return blank(); }
}
const saveView = (s) => store.set(KEY, JSON.stringify({ view: s.view, people: [...s.people], tags: [...s.tags], period: s.period }));

const shortName = (name) => (name.length <= 12 ? name : name.split(' ').at(-1));
const whoName = (ctx, id) => ctx.team.members.find((m) => m.id === id) ?? { id, name: 'Một bạn' };
const clock = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
const fullTime = (iso) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDay = (iso) => { const [, m, d] = vnDate(new Date(iso)).split('-').map(Number); return `${d}/${m}`; };
const isDefault = (key) => DEFAULT_TAGS.some((t) => t.key === key);
const VIEW_ICON = { all: 'bulb', replies: 'thread', top: 'agree', used: 'check', feedback: 'feedback' };

// Everything the badges count: new notes from others, and new replies in her threads.
export function newsFor(all, meId, seenAt) {
  const { notes, replies } = splitThreads(all);
  return { unseen: unseenCounts(notes, seenAt, meId), replies: replyNews(notes, replies, seenAt, meId) };
}

/* ---------- What is open ---------- */

function scopeTitle(ctx, s) {
  const people = [...s.people].map((id) => whoName(ctx, id));
  const tags = [...s.tags];
  const who = people.length === 1 ? people[0].name : people.map((m) => shortName(m.name)).join(', ');
  const lead = people.length === 1 ? face(people[0], 'sm') : people.length ? `<span class="bk-faces">${people.slice(0, 3).map((m) => face(m, 'xs')).join('')}</span>` : '<span class="bk-hash">#</span>';
  // Lý do sửa bài keeps its name when she picks people in it.
  if (s.view === 'feedback') return people.length ? { icon: lead, text: `${who} · Lý do sửa bài` } : { icon: icon('feedback'), text: 'Lý do sửa bài' };
  if (!people.length && !tags.length) return { icon: icon(VIEW_ICON[s.view]), text: VIEWS.find(([k]) => k === s.view)[1] };
  const what = tags.map((t) => `#${tagLabel(t)}`).join(', ');
  return { icon: lead, text: [who, people.length ? what : tags.map((t) => tagLabel(t)).join(', ')].filter(Boolean).join(' · ') };
}
function scopeSub(ctx, view) {
  const s = view.state;
  const n = view.shown.length;
  if (s.view === 'feedback') return s.people.size || s.query || s.period !== 'all' ? `${n} phản hồi` : 'Vì sao mọi người sửa bài, bỏ bài và góp ý bài chọn';
  if (s.people.size === 1 && !s.tags.size) {
    const p = personSummary(view.list, [...s.people][0]);
    return `${p.count} insight · ${p.agrees} lượt đồng ý · ${p.used} đã dùng`;
  }
  if (s.tags.size === 1 && !s.people.size && isDefault([...s.tags][0])) return `${DEFAULT_TAGS.find((t) => t.key === [...s.tags][0]).hint} · ${n} insight`;
  if (!s.people.size && !s.tags.size) {
    if (s.view === 'replies') return 'Các cuộc trò chuyện có bạn, mới nhất ở dưới';
    if (s.view === 'top') return 'Insight được nhiều bạn đồng ý nhất';
    if (s.view === 'used') return 'Insight Vika đã đưa vào cách chọn bài và viết bài';
    return 'Điều cả nhóm nhận ra khi chọn bài và viết bài';
  }
  return `${n} insight`;
}

/* ---------- Pieces of a note ---------- */

// Every note and reply shows its like first, one tap, even at 0 (Nam, 2026-11-07): 👍 Đồng ý on someone else's note,
// ❤️ Thích on her own, where Đồng ý is not allowed. The other reactions follow when someone chose them.
function reactsHtml(ctx, x, { reply = false } = {}) {
  const own = x.member_id === ctx.me.id;
  const main = own ? 'heart' : 'agree';
  const sum = reactionSummary(x.reactions ?? [], ctx.me.id);
  const like = sum.find((r) => r.kind === main) ?? { ...REACTIONS.find((r) => r.kind === main), count: 0, mine: false, who: [] };
  const names = (r) => r.who.map((id) => (id === ctx.me.id ? 'Bạn' : whoName(ctx, id).name)).join(', ');
  const likeHtml = `<button type="button" class="bk-react bk-like${like.mine ? ' is-on' : ''}" data-react="${main}" aria-pressed="${like.mine}"
    title="${esc(like.count ? `${names(like)}: ${like.label}` : like.label)}"><span class="bk-emo">${like.emoji}</span><span class="bk-like-l">${esc(like.label)}</span>${like.count ? `<b>${like.count}</b>` : ''}</button>`;
  const pills = sum.filter((r) => r.kind !== main).map((r) => {
    const locked = r.kind === 'agree' && own;
    return `<button type="button" class="bk-react${r.mine ? ' is-on' : ''}" ${locked ? 'disabled' : `data-react="${r.kind}"`} aria-pressed="${r.mine}"
      title="${esc(names(r))}: ${esc(r.label)}" aria-label="${esc(r.label)}, ${r.count}: ${esc(names(r))}"><span class="bk-emo">${r.emoji}</span><b>${r.count}</b></button>`;
  }).join('');
  return `<div class="bk-acts${sum.length ? ' has-reacts' : ''}">${likeHtml}${pills}
    <button type="button" class="bk-act" ${reply ? `data-reply-to="${esc(x.member_id)}"` : 'data-thread-open'} aria-label="Trả lời">${icon('reply')}<span>Trả lời</span></button>
    <button type="button" class="bk-act bk-act-emo" data-picker aria-label="Thả cảm xúc" title="Thả cảm xúc">${icon('smile')}</button>
  </div>`;
}

// Nam's note on how Insights works (Nam, 2026-11-07): it sits under the chat's header on every view, whole, with his
// face, and stays while the chat scrolls. It is still a note in the chat, where it takes replies and reactions. A
// member may fold it to one line on her device; it opens again with one tap.
const GUIDE_FOLD = 'studio.bk.guideFolded';
function guideHtml(ctx, view) {
  const g = view.list.find((x) => x.id === GUIDE_ID);
  if (!g) return '';
  const who = whoName(ctx, g.member_id);
  const folded = view.guideFolded;
  return `<section class="bk-guide${folded ? ' is-folded' : ''}" aria-label="Insights dùng thế nào">
    ${face(who)}
    <div class="bk-guide-main">
      <p class="bk-guide-h"><b>${esc(who.name)}</b><span>Insights dùng thế nào</span></p>
      <p class="bk-guide-text">${linkify(esc(g.body))}</p>
    </div>
    <button type="button" class="bk-guide-fold" data-guide-fold aria-expanded="${!folded}" aria-label="${folded ? 'Mở lời nhắn' : 'Thu gọn lời nhắn'}">${icon(folded ? 'down' : 'up')}</button>
  </section>`;
}

function vikaHtml(x) {
  if (x.outcome === 'used' || x.outcome_note) {
    return `<div class="bk-vika"><i class="av bk-vika-av" aria-hidden="true">V</i><div class="bk-vika-main">
      <p class="bk-vika-h"><b>Vika</b>${x.outcome === 'used' ? `<span class="bk-used">${icon('check')}Đã dùng</span>` : '<span class="bk-seen-pill">Đã đọc</span>'}<time>${esc(shortDay(x.read_at ?? x.created_at))}</time></p>
      ${x.outcome_note ? `<p>${esc(x.outcome_note)}</p>` : ''}</div></div>`;
  }
  return x.read_at ? `<p class="bk-seen">${icon('check')}Vika đã đọc · ${esc(shortDay(x.read_at))}</p>` : '';
}

function textHtml(ctx, x, query) {
  let html = linkify(esc(x.body));
  // @Name at the start of a reply names who it answers.
  html = html.replace(/^@([^\s@]+(?: [^\s@]+)?)(?=\s)/u, (all, name) => (ctx.team.members.some((m) => m.name === name) ? `<b class="bk-at">@${name}</b>` : all));
  const q = query.trim();
  if (q && q.length > 1) {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'giu');
    html = html.replace(/(<[^>]+>)|([^<]+)/g, (all, tag, text) => tag ?? text.replace(re, '<mark>$1</mark>'));
  }
  return html;
}

const hoverHtml = (ctx, x, { reply = false } = {}) => {
  const mine = x.member_id === ctx.me.id;
  return `<div class="bk-hover" role="toolbar" aria-label="Thao tác">
    <button type="button" data-picker title="Thả cảm xúc">${icon('smile')}</button>
    <button type="button" ${reply ? `data-reply-to="${esc(x.member_id)}"` : 'data-thread-open'} title="Trả lời">${icon('reply')}</button>
    <button type="button" data-copy title="Sao chép">${icon('copy')}</button>
    ${mine ? `<button type="button" data-edit title="Sửa">${icon('pen')}</button><button type="button" data-delete title="Xoá" class="is-warn">${icon('close')}</button>` : ''}
  </div>
  <button type="button" class="bk-touch" data-actions aria-label="Thao tác">${icon('more')}</button>`;
};

function replyHtml(ctx, r, view) {
  const who = whoName(ctx, r.member_id);
  const t = clock.format(new Date(r.created_at));
  return `<div class="bk-reply${r.pending ? ' is-pending' : ''}${r.member_id === ctx.me.id ? ' is-mine' : ''}" data-id="${esc(r.id)}" data-parent="${esc(r.parent_id)}">
    <button type="button" class="bk-rface" data-person="${esc(who.id)}" aria-label="Xem insight của ${esc(who.name)}">${face(who)}</button>
    <div class="bk-reply-main">
      <header class="bk-msg-h"><button type="button" class="bk-name" data-person="${esc(who.id)}">${esc(who.name)}</button>
        <time datetime="${esc(r.created_at)}" title="${esc(fullTime(r.created_at))}">${esc(timeLabel(r.created_at))}</time>
        ${r.edited_at ? '<span class="bk-edited">đã sửa</span>' : ''}${r.pending ? '<span class="bk-sending">Đang gửi…</span>' : ''}
        ${!r.pending && view.seenAt && r.member_id !== ctx.me.id && r.created_at > view.seenAt ? '<span class="bk-tnew">Mới</span>' : ''}</header>
      <div class="bk-msg-text">${textHtml(ctx, r, view.state.query)}</div>
      ${r.pending ? '' : reactsHtml(ctx, r, { reply: true })}
    </div>
    ${r.pending ? '' : hoverHtml(ctx, r, { reply: true })}
  </div>`;
}

// Folded: the faces of who answered and "N câu trả lời". Open: the replies on a thread line and a box to answer.
function threadHtml(ctx, x, view) {
  const list = view.replies.get(x.id) ?? [];
  const open = view.open.has(x.id);
  const news = view.news.byParent.get(x.id) ?? 0;
  if (!open) {
    if (!list.length) return '';
    const faces = [...new Set(list.map((r) => r.member_id))].slice(0, 3).map((id) => face(whoName(ctx, id), 'xs')).join('');
    return `<button type="button" class="bk-tsum" data-thread-open aria-expanded="false">
      <span class="bk-faces">${faces}</span><b>${list.length} câu trả lời</b>${news ? `<span class="bk-tnew">${news} mới</span>` : ''}
      <span class="bk-tlast">${esc(timeLabel(list.at(-1).created_at))}</span><span class="bk-tgo">${icon('down')}</span></button>`;
  }
  const all = view.full.has(x.id);
  const shown = all ? list : list.slice(-THREAD_TAIL);
  const hidden = list.length - shown.length;
  return `<div class="bk-thread" data-thread="${esc(x.id)}">
    <div class="bk-thead"><span>${list.length ? `${list.length} câu trả lời` : 'Trả lời'}</span>
      <button type="button" class="bk-thide" data-thread-close>${icon('up')}Ẩn</button></div>
    ${hidden ? `<button type="button" class="bk-tmore" data-thread-all>Xem ${hidden} câu trả lời trước</button>` : ''}
    ${shown.map((r) => replyHtml(ctx, r, view)).join('')}
    <div class="bk-treply">${face(ctx.me)}<div class="bk-treply-box">${composerHtml(ctx, { variant: 'reply', parentId: x.id,
      placeholder: `Trả lời ${x.member_id === ctx.me.id ? 'cả nhóm' : whoName(ctx, x.member_id).name}…` })}</div></div>
  </div>`;
}

function msgHtml(ctx, x, view, { stacked = false, dated = false } = {}) {
  const who = whoName(ctx, x.member_id);
  const mine = x.member_id === ctx.me.id;
  const card = x.card_id ? view.cards.get(x.card_id) : null;
  const long = x.body.length > 520 || x.body.split('\n').length > 9;
  const t = clock.format(new Date(x.created_at));
  const open = view.open.has(x.id);
  return `<article class="bk-msg${stacked ? ' is-stacked' : ''}${mine ? ' is-mine' : ''}${x.pending ? ' is-pending' : ''}${x.outcome === 'used' ? ' is-used' : ''}${open ? ' is-open' : ''}${view.flash === x.id ? ' is-just' : ''}"
    data-id="${esc(x.id)}" aria-label="${esc(who.name)}, ${esc(t)}">
    <div class="bk-gut">${stacked ? `<time class="bk-gut-t" datetime="${esc(x.created_at)}" title="${esc(fullTime(x.created_at))}">${esc(t)}</time>`
      : `<button type="button" class="bk-face" data-person="${esc(who.id)}" aria-label="Xem insight của ${esc(who.name)}">${face(who)}</button>`}</div>
    <div class="bk-msg-main">
      ${stacked ? '' : `<header class="bk-msg-h"><button type="button" class="bk-name" data-person="${esc(who.id)}">${esc(who.name)}</button>
        <time datetime="${esc(x.created_at)}" title="${esc(fullTime(x.created_at))}">${dated ? `${esc(shortDay(x.created_at))} · ` : ''}${esc(t)}</time>
        ${x.edited_at ? '<span class="bk-edited">đã sửa</span>' : ''}${x.pending ? '<span class="bk-sending">Đang gửi…</span>' : ''}</header>`}
      <div class="bk-msg-text${long ? ' is-long' : ''}">${textHtml(ctx, x, view.state.query)}</div>
      ${long ? '<button type="button" class="bk-expand" data-expand>Xem thêm</button>' : ''}
      ${x.tags.length ? `<div class="bk-msg-tags">${x.tags.map((tag) => `<button type="button" class="bk-tag${view.state.tags.has(tag) ? ' is-on' : ''}" data-solo-tag="${esc(tag)}">#${esc(tagLabel(tag))}</button>`).join('')}</div>` : ''}
      ${card ? `<blockquote class="bk-attach"><p class="bk-attach-k">${icon('stack')}Viết khi làm bài</p><p>${esc(firstLine(card.op, 140))}</p></blockquote>` : ''}
      ${vikaHtml(x)}
      ${x.pending ? '' : reactsHtml(ctx, x)}
      ${x.pending ? '' : threadHtml(ctx, x, view)}
    </div>
    ${x.pending ? '' : hoverHtml(ctx, x)}
  </article>`;
}

/* ---------- The chat ---------- */

// The notes of the open scope. A search also finds a note by the words of its replies.
function scopeNotes(ctx, view) {
  const s = view.state;
  if (s.view === 'replies' && !s.people.size && !s.tags.size) {
    const mine = myThreads(view.list, view.replies, ctx.me.id).reverse();
    return s.query ? mine.filter((x) => matches(view, x)) : mine;
  }
  const base = scopeList(view.list, { ...s, query: '', view: s.view === 'replies' ? 'all' : s.view });
  return s.query ? base.filter((x) => matches(view, x)) : base;
}
function matches(view, x) {
  const q = compact(view.state.query);
  return compact(x.body).includes(q) || x.tags.some((t) => compact(t).includes(q)) || (view.replies.get(x.id) ?? []).some((r) => compact(r.body).includes(q));
}

/* ---------- Lý do sửa bài (Góp ý, merged 2026-11-07) ---------- */

// One feedback entry in the chat's shape: who, what kind, her words, the reasons, the card and the change, folded.
function fbHtml(ctx, f, view) {
  const who = whoName(ctx, f.member_id);
  const t = clock.format(new Date(f.at));
  const fresh = view.seenAt && f.member_id !== ctx.me.id && f.at > view.seenAt;
  return `<article class="bk-msg bk-fb${f.member_id === ctx.me.id ? ' is-mine' : ''}" data-fb="${esc(f.id)}" aria-label="${esc(who.name)}, ${esc(f.title)}">
    <div class="bk-gut"><button type="button" class="bk-face" data-person="${esc(who.id)}" aria-label="Xem phản hồi của ${esc(who.name)}">${face(who)}</button></div>
    <div class="bk-msg-main">
      <header class="bk-msg-h"><button type="button" class="bk-name" data-person="${esc(who.id)}">${esc(who.name)}</button>
        <time datetime="${esc(f.at)}" title="${esc(fullTime(f.at))}">${esc(t)}</time>${fresh ? '<span class="bk-tnew">Mới</span>' : ''}</header>
      <div class="bk-fb-kind"><span class="bk-kind is-${esc(f.kind ?? 'other')}">${esc(f.title)}</span>${f.part ? `<span class="bk-chip">${esc(f.part)}</span>` : ''}
        ${f.chips.map(([label, tone]) => `<span class="bk-chip${tone ? ` is-${tone}` : ''}">${esc(label)}</span>`).join('')}${f.handle ? `<span class="bk-chip">@${esc(f.handle)}</span>` : ''}</div>
      ${f.text ? `<div class="bk-msg-text">${textHtml(ctx, { body: f.text }, view.state.query)}</div>` : ''}
      ${f.tags.length ? `<div class="bk-reasons">${f.tags.map((r) => `<span class="bk-reason">${esc(r)}</span>`).join('')}</div>` : ''}
      ${f.next ? `<p class="bk-fb-next">Lần sau cũng vậy? <b>${esc(f.next)}</b></p>` : ''}
      ${f.card_op ? `<blockquote class="bk-attach"><p class="bk-attach-k">${icon('stack')}Bài</p><p>${esc(firstLine(f.card_op, 140))}</p></blockquote>` : ''}
      ${f.diff ? `<details class="bk-diff"><summary>${icon('down')}<span>Xem chỗ sửa</span></summary>${diffHtml(f.diff.before, f.diff.after)}</details>` : ''}
      <div class="bk-acts"><button type="button" class="bk-act bk-fb-note" data-fb-note title="Viết thành một điều đúng cho nhiều bài">${icon('bulb')}<span>Biến thành insight</span></button></div>
    </div>
  </article>`;
}

function feedbackHtml(ctx, view) {
  const s = view.state;
  if (view.feedback === null) {
    view.shown = [];
    return `<div class="bk-hello"><span class="bk-hello-i">${icon('feedback')}</span><h2>Đang tải lý do sửa bài…</h2></div>`;
  }
  if (view.feedback === false) {
    view.shown = [];
    return `<div class="bk-hello"><span class="bk-hello-i">${icon('feedback')}</span><h2>Chưa tải được</h2><p>Kiểm tra mạng rồi mở lại trang.</p></div>`;
  }
  const since = s.period === 'all' ? null : addDays(vnDate(), 1 - Number(s.period));
  const q = compact(s.query);
  const list = view.feedback.filter((f) => (!s.people.size || s.people.has(f.member_id))
    && (!since || vnDate(new Date(f.at)) >= since)
    && (!q || compact(`${f.text} ${f.card_op ?? ''} ${f.tags.join(' ')} ${f.title}`).includes(q)))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  view.shown = list;
  const t = scopeTitle(ctx, s);
  const head = `<div class="bk-start"><span class="bk-start-i">${t.icon}</span><h2>${esc(t.text)}</h2><p>${esc(scopeSub(ctx, view))}. Thấy một ý đúng cho nhiều bài, bấm Biến thành insight.</p></div>`;
  if (!list.length) {
    return `${head}<div class="bk-hello is-small"><p>${s.query || s.people.size || s.period !== 'all' ? 'Không có phản hồi nào khớp.' : 'Khi bạn sửa bài rồi đăng, Studio hỏi vì sao. Câu trả lời hiện ở đây.'}</p></div>`;
  }
  const today = vnDate();
  const out = [];
  let day = null;
  for (const f of list) {
    const d = vnDate(new Date(f.at));
    if (d !== day) {
      out.push(`${day ? '</section>' : ''}<section class="bk-dayg" aria-label="${esc(dayLabel(d, today))}"><div class="bk-daybar" role="separator"><span>${esc(dayLabel(d, today))}</span></div>`);
      day = d;
    }
    out.push(fbHtml(ctx, f, view));
  }
  return `${head}${out.join('')}</section>`;
}

function streamHtml(ctx, view) {
  const s = view.state;
  if (s.view === 'feedback') return feedbackHtml(ctx, view);
  const all = scopeNotes(ctx, view);
  view.shown = all;
  if (s.view === 'replies' && !s.people.size && !s.tags.size) for (const x of all) view.open.add(x.id);
  if (!view.list.length) {
    return `<div class="bk-hello"><span class="bk-hello-i">${icon('bulb')}</span><h2>Insight đầu tiên là của bạn</h2>
      <p>Ghi điều bạn nhận ra sau nhiều bài: viết lại sao cho hay, bài kiểu nào dễ lan. Cả nhóm cùng thấy, và cứ 2 tuần Vika đọc hết.</p></div>`;
  }
  if (!all.length) {
    const empty = s.query ? `Không có insight nào có chữ “${esc(s.query)}”.` : s.view === 'replies' ? 'Khi có bạn trả lời insight của bạn, hoặc trả lời trong cuộc trò chuyện bạn tham gia, nó hiện ở đây.' : 'Bộ lọc này chưa có insight nào.';
    return `<div class="bk-hello"><span class="bk-hello-i">${icon(s.query ? 'search' : VIEW_ICON[s.view] ?? 'bulb')}</span><h2>Chưa có gì ở đây</h2><p>${empty}</p>
      <button type="button" class="btn btn-line sm" data-reset>Về Cả nhóm</button></div>`;
  }
  const items = all.slice(Math.max(0, all.length - view.limit));
  const older = all.length - items.length;
  const t = scopeTitle(ctx, s);
  const head = older ? `<div class="bk-older"><button type="button" class="bk-older-b" data-older>${icon('up')}Xem ${Math.min(CHUNK, older)} insight cũ hơn</button></div>`
    : `<div class="bk-start"><span class="bk-start-i">${t.icon}</span><h2>${esc(t.text)}</h2><p>${esc(scopeSub(ctx, view))}</p></div>`;
  if (s.view === 'top' || (s.view === 'replies' && !s.people.size && !s.tags.size)) {
    const list = s.view === 'top' ? [...items].reverse() : items;
    return `${head}${list.map((x) => msgHtml(ctx, x, view, { dated: true })).join('')}`;
  }
  const marks = !s.people.size && !s.tags.size && s.view === 'all' && !s.query ? readMarks(view.list) : [];
  const mark = (m) => `<div class="bk-event" role="note"><span>${icon('bulb')}<b>Vika</b> đọc ${m.count} insight${m.used ? `, dùng ${m.used}` : ''} · ${esc(shortDay(m.at))}</span></div>`;
  const out = [];
  let day = null;
  let newShown = false;
  const today = vnDate();
  const stack = stackMessages(items);
  for (const [i, x] of stack.entries()) {
    while (marks.length && marks[0].at < x.created_at) out.push(mark(marks.shift()));
    const d = vnDate(new Date(x.created_at));
    let fresh = false;
    if (!newShown && view.unseen.first && x.id === view.unseen.first) { fresh = true; newShown = true; }
    // Each day is its own section, so its sticky label leaves with its last note.
    if (d !== day) {
      out.push(`${day ? '</section>' : ''}<section class="bk-dayg" aria-label="${esc(dayLabel(d, today))}"><div class="bk-daybar" role="separator"><span>${esc(dayLabel(d, today))}</span></div>`);
      day = d;
    }
    if (fresh) out.push('<div class="bk-newline" id="bk-newline" role="separator"><span>Mới</span></div>');
    // A note under a note with replies starts its own group, so its name shows.
    const prev = stack[i - 1];
    const afterThread = Boolean(prev && (view.open.has(prev.id) || view.replies.get(prev.id)?.length));
    out.push(msgHtml(ctx, x, view, { stacked: x.stacked && !fresh && !afterThread }));
  }
  if (day) out.push('</section>');
  for (const m of marks) out.push(mark(m));
  return `${head}${out.join('')}`;
}

/* ---------- The side list ---------- */

function navHtml(ctx, view, { sheet = false } = {}) {
  const s = view.state;
  const u = view.unseen;
  const counts = new Map();
  for (const x of view.list) counts.set(x.member_id, (counts.get(x.member_id) ?? 0) + 1);
  const people = ctx.team.members.filter((m) => counts.has(m.id) || m.id === ctx.me.id)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'vi'));
  const tags = tagCounts(view.list);
  const plain = !s.people.size && !s.tags.size;
  const badge = (n, total) => (n ? `<b class="bk-badge">${n}</b>` : total == null ? '' : `<small>${total}</small>`);
  const add = (attr, key, on, label) => `<button type="button" class="bk-add" ${attr}="${esc(key)}" aria-pressed="${on}" aria-label="${esc(label)}" title="${on ? 'Bỏ khỏi bộ lọc' : 'Thêm vào bộ lọc'}">${icon(on ? 'check' : 'plus')}</button>`;
  const viewCount = { all: badge(u.total, view.list.length), replies: badge(view.news.toMe.size, null), top: '', used: `<small>${view.list.filter((x) => x.outcome === 'used').length}</small>` };
  return `<div class="bk-nav-in">
    ${sheet ? '' : `<div class="bk-nav-h"><p>Vika studio</p><h1>Insights</h1><span>${view.list.length} insight · ${counts.size} người</span></div>`}
    <div class="bk-nav-g">${VIEWS.filter(([k]) => k !== 'feedback').map(([k, label]) => `<button type="button" class="bk-ni${k === 'replies' && view.news.toMe.size ? ' is-unread' : ''}" data-view="${k}" aria-current="${plain && s.view === k}">
      <span class="bk-ni-i">${icon(VIEW_ICON[k])}</span><span class="bk-ni-l">${label}</span>${viewCount[k]}</button>`).join('')}</div>
    <h2 class="bk-nav-s">Phản hồi</h2>
    <div class="bk-nav-g"><button type="button" class="bk-ni${view.fbNew ? ' is-unread' : ''}" data-view="feedback" aria-current="${s.view === 'feedback'}">
      <span class="bk-ni-i">${icon('feedback')}</span><span class="bk-ni-l">Lý do sửa bài</span>${Array.isArray(view.feedback) ? badge(view.fbNew, view.feedback.length) : ''}</button></div>
    <h2 class="bk-nav-s">Kênh</h2>
    <div class="bk-nav-g">${tags.map((t) => {
      const on = s.tags.has(t.key);
      const unread = u.byTag.get(t.key) ?? 0;
      return `<div class="bk-nr${on ? ' is-on' : ''}${unread ? ' is-unread' : ''}"><button type="button" class="bk-ni" data-solo-tag="${esc(t.key)}" aria-current="${on && s.tags.size === 1 && !s.people.size}">
        <span class="bk-ni-i bk-hash">#</span><span class="bk-ni-l">${esc(tagLabel(t.key))}</span>${badge(unread, t.count)}</button>${add('data-tag', t.key, on, `#${tagLabel(t.key)}`)}</div>`;
    }).join('')}</div>
    <h2 class="bk-nav-s">Thành viên</h2>
    <div class="bk-nav-g">${people.map((m) => {
      const on = s.people.has(m.id);
      const unread = u.byPerson.get(m.id) ?? 0;
      return `<div class="bk-nr${on ? ' is-on' : ''}${unread ? ' is-unread' : ''}"><button type="button" class="bk-ni" data-solo-person="${esc(m.id)}" aria-current="${on && s.people.size === 1 && !s.tags.size}">
        ${face(m, 'xs')}<span class="bk-ni-l">${esc(m.name)}${m.id === ctx.me.id ? ' <em>bạn</em>' : ''}</span>${badge(unread, counts.get(m.id) ?? 0)}</button>${add('data-person', m.id, on, m.name)}</div>`;
    }).join('')}</div>
    ${loopHtml(view)}
  </div>`;
}

function loopHtml(view) {
  const next = nextReadDay(view.list);
  return `<div class="bk-loop"><p class="bk-loop-k">${icon('bulb')}Vika đọc mỗi 2 tuần</p>
    <p class="bk-loop-n"><b>${unreadCount(view.list)}</b> insight chờ đọc</p>
    <p class="bk-loop-f">${next ? `Lần tới: ${esc(dayLabel(next).toLowerCase())}` : 'Lần đọc đầu tiên sắp tới'}</p></div>`;
}

/* ---------- The header of the chat ---------- */

function headHtml(ctx, view) {
  const s = view.state;
  const t = scopeTitle(ctx, s);
  const plain = !s.people.size && !s.tags.size && s.view === 'all';
  const period = PERIODS.find(([k]) => k === s.period)[1];
  const dot = view.unseen.total + view.news.toMe.size;
  return `<div class="bk-head-l">
      <button type="button" class="bk-scope" data-scope aria-haspopup="dialog">
        <span class="bk-scope-i">${t.icon}</span><span class="bk-scope-t"><b>${esc(t.text)}</b><small>${esc(scopeSub(ctx, view))}</small></span>
        <span class="bk-scope-c">${dot ? `<i class="bk-scope-dot" aria-label="${dot} mới"></i>` : ''}${icon('down')}</span></button>
      ${plain ? '' : `<button type="button" class="bk-x" data-reset aria-label="Về Cả nhóm" title="Về Cả nhóm">${icon('close')}</button>`}
    </div>
    <div class="bk-head-r">
      <div class="bk-menu-w"><button type="button" class="bk-hb${s.period !== 'all' ? ' is-on' : ''}" data-period-menu aria-haspopup="menu" aria-expanded="false">
        ${icon('today')}<span>${esc(period)}</span></button></div>
      <button type="button" class="bk-hb${s.query ? ' is-on' : ''}" data-search aria-label="Tìm" aria-expanded="${view.searching}">${icon('search')}</button>
    </div>`;
}

const searchHtml = (view) => `<label class="bk-find">${icon('search')}<span class="sr-only">Tìm trong insight</span>
  <input type="search" id="bk-q" placeholder="Tìm chữ, thẻ hoặc câu trả lời" value="${esc(view.state.query)}" autocomplete="off" enterkeyhint="search">
  <span class="bk-find-n" id="bk-find-n">${view.state.query ? `${view.shown.length} kết quả` : ''}</span>
  <button type="button" class="bk-find-x" data-search-close aria-label="Đóng tìm kiếm">${icon('close')}</button></label>`;

const placeholderFor = (view) => {
  if (view.state.view === 'feedback') return 'Rút ra một insight chung từ các lý do sửa…';
  const tags = [...view.state.tags];
  return tags.length === 1 ? `Ghi vào #${tagLabel(tags[0])}…` : 'Ghi một insight cho cả nhóm…';
};

/* ---------- Page ---------- */

export async function renderIntuitions(main, ctx) {
  const all = await loadIntuitions();
  learnTags(all);
  const seenAt = store.get(SEEN);
  const { notes, replies } = splitThreads(all);
  const view = { list: notes, replies, state: readView(), cards: new Map(), limit: CHUNK, shown: [], searching: false, seenAt,
    unseen: unseenCounts(notes, seenAt, ctx.me.id), news: replyNews(notes, replies, seenAt, ctx.me.id), composer: null,
    open: new Set(), full: new Set(), boxes: new Map(), feedback: null, fbNew: 0, guideFolded: store.get(GUIDE_FOLD) === '1' };
  // An old Góp ý link opens Lý do sửa bài (main.js).
  let openFeedback = false;
  try { openFeedback = sessionStorage.getItem('studio.bk.open') === 'feedback'; sessionStorage.removeItem('studio.bk.open'); } catch { /* storage blocked */ }
  if (openFeedback) Object.assign(view.state, blank(), { view: 'feedback' });
  for (const id of view.state.people) if (!ctx.team.members.some((m) => m.id === id)) view.state.people.delete(id);
  for (const k of view.state.tags) if (!tagCounts(notes).some((t) => t.key === k)) view.state.tags.delete(k);
  // Threads with new replies to her open by themselves.
  for (const id of view.news.toMe) view.open.add(id);
  const s = view.state;

  main.innerHTML = `<div class="bk-app" id="bk-app">
    <aside class="bk-nav" aria-label="Kênh và thành viên" id="bk-nav">${navHtml(ctx, view)}</aside>
    <section class="bk-pane" aria-label="Insights">
      <header class="bk-head" id="bk-head">${headHtml(ctx, view)}</header>
      <div class="bk-guide-host" id="bk-guide">${guideHtml(ctx, view)}</div>
      <div class="bk-findrow" id="bk-findrow" hidden></div>
      <div class="bk-scroll" id="bk-scroll"><div class="bk-stream" id="bk-stream" aria-live="polite">${streamHtml(ctx, view)}</div></div>
      <button type="button" class="bk-jump" id="bk-jump" hidden>${icon('down')}<span>Insight mới</span></button>
      <div class="bk-dock">${composerHtml(ctx, { variant: 'chat', placeholder: placeholderFor(view) })}</div>
    </section>
  </div>`;
  store.set(SEEN, new Date().toISOString());
  const app = main.querySelector('#bk-app');
  const scroller = main.querySelector('#bk-scroll');
  const stream = main.querySelector('#bk-stream');

  // The chat fills the screen between Studio's header and the tab bar; the keyboard on a phone shrinks it.
  const fit = () => {
    if (!app.isConnected) { removeEventListener('resize', fit); visualViewport?.removeEventListener('resize', fit); return; }
    const vh = visualViewport?.height ?? innerHeight;
    const tabs = document.getElementById('tabs');
    const box = tabs?.getBoundingClientRect();
    const docked = tabs && getComputedStyle(tabs).position === 'fixed' && getComputedStyle(tabs).display !== 'none' && box.top > innerHeight / 2;
    app.style.height = `${Math.max(360, vh - app.getBoundingClientRect().top - (docked ? innerHeight - box.top + 10 : 20))}px`;
  };
  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  const toBottom = (smooth = false) => scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  // "Xem" in the toast after a quick note opens the chat at that note.
  let focusId = null;
  try { focusId = sessionStorage.getItem(FOCUS); sessionStorage.removeItem(FOCUS); } catch { /* storage blocked */ }
  const openAt = () => {
    // A filter that hides the note gives way to Cả nhóm.
    if (focusId && view.list.some((x) => x.id === focusId) && !stream.querySelector(`.bk-msg[data-id="${CSS.escape(focusId)}"]`)) {
      Object.assign(s, blank());
      paint({ keepScroll: true });
    }
    const target = focusId && stream.querySelector(`.bk-msg[data-id="${CSS.escape(focusId)}"]`);
    // The flash lives on the view for 2 seconds, so a repaint (the feedback load) keeps it.
    if (target) {
      view.flash = focusId;
      target.classList.add('is-just');
      target.scrollIntoView({ block: 'center' });
      setTimeout(() => { view.flash = null; }, 2000);
      return;
    }
    const line = stream.querySelector('#bk-newline');
    if (line && s.view === 'all') scroller.scrollTop += line.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 56;
    else if (s.view === 'top') scroller.scrollTop = 0;
    else toBottom();
  };
  // The page is on screen only after the route swaps it in, so it measures and listens from then.
  requestAnimationFrame(() => {
    fit();
    openAt();
    addEventListener('resize', fit);
    visualViewport?.addEventListener('resize', fit);
  });

  const jump = main.querySelector('#bk-jump');
  scroller.addEventListener('scroll', () => {
    if (nearBottom()) jump.hidden = true;
    if (scroller.scrollTop < 40 && stream.querySelector('[data-older]')) older();
  }, { passive: true });
  jump.addEventListener('click', () => { jump.hidden = true; toBottom(true); });

  // Each open thread's reply box, wired after each paint; its text survives in the thread's draft.
  function wireThreads() {
    view.boxes.clear();
    stream.querySelectorAll('.bk-thread').forEach((t) => {
      const parentId = t.dataset.thread;
      const form = t.querySelector('.bk-treply [data-jot]');
      if (!form) return;
      view.boxes.set(parentId, wireComposer(form, ctx, { variant: 'reply', parentId,
        onPending: (row) => placeReply(row),
        onFailed: (clientId) => { dropPending(parentId, clientId); },
        onFocus: () => { document.body.classList.add('bk-typing'); fit(); },
        onBlur: () => { document.body.classList.remove('bk-typing'); fit(); } }));
    });
  }
  function older() {
    const before = scroller.scrollHeight;
    view.limit += CHUNK;
    stream.innerHTML = streamHtml(ctx, view);
    wireThreads();
    scroller.scrollTop += scroller.scrollHeight - before;
  }

  // Paints what a change touches: the list, the header and the chat. A change of scope lands at the bottom.
  function paint({ keepScroll = false } = {}) {
    saveView(s);
    const top = scroller.scrollTop;
    const focused = document.activeElement?.closest?.('.bk-thread')?.dataset.thread;
    main.querySelector('#bk-nav').innerHTML = navHtml(ctx, view);
    stream.innerHTML = streamHtml(ctx, view);
    wireThreads();
    main.querySelector('#bk-head').innerHTML = headHtml(ctx, view);
    main.querySelector('#bk-guide').innerHTML = guideHtml(ctx, view);
    const n = main.querySelector('#bk-find-n');
    if (n) n.textContent = s.query ? `${view.shown.length} kết quả` : '';
    view.composer?.setPlaceholder(placeholderFor(view));
    view.composer?.setTags([...s.tags]);
    if (keepScroll) scroller.scrollTop = top; else if (s.view === 'top') scroller.scrollTop = 0; else toBottom();
    if (focused) view.boxes.get(focused)?.focus();
    paintSheet();
  }
  const setScope = (patch) => { Object.assign(s, patch); view.limit = CHUNK; view.unseen = { ...view.unseen, first: null }; paint(); };
  const toggle = (set, key) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; };
  const find = (id) => view.list.find((x) => x.id === id) ?? [...view.replies.values()].flat().find((r) => r.id === id);

  // A new note goes to the bottom; while it sends it shows as "Đang gửi…".
  const placeNew = (row) => {
    if (row.parent_id) { placeReply(row); return; }
    if (!['all'].includes(s.view) || (s.people.size && !s.people.has(ctx.me.id)) || (s.tags.size && !row.tags.some((t) => s.tags.has(t))) || s.query) Object.assign(s, blank());
    view.list = [...view.list.filter((x) => x.client_id !== row.client_id), row];
    learnTags(view.list);
    paint();
    if (!row.pending) stream.querySelector(`.bk-msg[data-id="${CSS.escape(row.id)}"]`)?.classList.add('is-just');
    toBottom(true);
  };
  // A reply goes to the end of its thread, which stays open, and the thread stays in view.
  function placeReply(row) {
    const list = (view.replies.get(row.parent_id) ?? []).filter((r) => r.client_id !== row.client_id);
    view.replies.set(row.parent_id, [...list, row]);
    view.open.add(row.parent_id);
    paint({ keepScroll: true });
    const box = stream.querySelector(`.bk-thread[data-thread="${CSS.escape(row.parent_id)}"] .bk-treply`);
    box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!row.pending) stream.querySelector(`.bk-reply[data-id="${CSS.escape(row.id)}"]`)?.classList.add('is-just');
  }
  function dropPending(parentId, clientId) {
    view.replies.set(parentId, (view.replies.get(parentId) ?? []).filter((r) => r.client_id !== clientId || !r.pending));
    paint({ keepScroll: true });
  }
  view.composer = wireComposer(main.querySelector('.bk-dock [data-jot]'), ctx, { variant: 'chat',
    onPending: placeNew,
    onFailed: (clientId) => { view.list = view.list.filter((x) => x.client_id !== clientId || !x.pending); paint({ keepScroll: true }); },
    onFocus: () => { document.body.classList.add('bk-typing'); fit(); if (nearBottom()) setTimeout(() => toBottom(), 60); },
    onBlur: () => { document.body.classList.remove('bk-typing'); fit(); } });
  view.composer.setTags([...s.tags]);
  wireThreads();
  const added = (e) => {
    if (!main.isConnected) { removeEventListener('studio:intuition', added); return; }
    placeNew(e.detail);
  };
  addEventListener('studio:intuition', added);

  async function fillCards() {
    const ids = [...new Set(view.list.map((x) => x.card_id).filter((id) => id && !view.cards.has(id)))];
    if (!ids.length) return;
    try {
      for (const c of await loadCardsBrief(ids)) view.cards.set(c.id, c);
      if (!main.isConnected) return;
      const atEnd = nearBottom();
      paint({ keepScroll: true });
      if (atEnd) toBottom();
    } catch (error) { console.error(error); }
  }
  fillCards();

  // Lý do sửa bài loads behind the chat, so its count shows in the list and the view opens at once later.
  async function loadFeedback(fresh = false) {
    try {
      const { loadFeedbackItems } = await import('./answers.js?v=20261109a');
      const items = await loadFeedbackItems(ctx, { fresh });
      view.feedback = items;
      view.fbNew = seenAt ? items.filter((f) => f.member_id !== ctx.me.id && f.at > seenAt).length : 0;
    } catch (error) {
      console.error(error);
      if (view.feedback === null) view.feedback = false;
    }
    if (!main.isConnected) return;
    if (s.view === 'feedback') paint(); else paint({ keepScroll: true });
  }
  loadFeedback();

  /* ---------- Search and period ---------- */

  const findRow = main.querySelector('#bk-findrow');
  function openSearch() {
    view.searching = true;
    findRow.innerHTML = searchHtml(view);
    findRow.hidden = false;
    const input = findRow.querySelector('#bk-q');
    input.focus();
    let typing;
    input.addEventListener('input', () => {
      clearTimeout(typing);
      typing = setTimeout(() => { s.query = input.value; view.limit = CHUNK; paint(); }, 140);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
    main.querySelector('[data-search]')?.setAttribute('aria-expanded', 'true');
  }
  function closeSearch() {
    view.searching = false;
    findRow.hidden = true;
    findRow.innerHTML = '';
    if (s.query) { s.query = ''; paint(); }
    main.querySelector('[data-search]')?.setAttribute('aria-expanded', 'false');
  }
  function closeMenus() {
    document.querySelectorAll('.bk-pop,.bk-picker').forEach((m) => m.remove());
    main.querySelectorAll('[aria-expanded="true"][data-period-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function popup(button, cls, html, onKey) {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = cls;
    menu.innerHTML = html;
    (button.closest('.bk-menu-w') ?? button.closest('.bk-msg-main,.bk-reply-main,.bk-hover')?.parentElement ?? button.parentElement).append(menu);
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenus(); button.focus(); } onKey?.(e); });
    return menu;
  }
  function periodMenu(button) {
    const menu = popup(button, 'bk-pop', `<p class="bk-pop-h">Hiện insight trong</p>${PERIODS.map(([k, l]) => `<button type="button" role="menuitemradio" aria-checked="${s.period === k}" data-set-period="${k}">${esc(l)}<i>${icon('check')}</i></button>`).join('')}`);
    menu.setAttribute('role', 'menu');
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('[aria-checked="true"]')?.focus();
  }
  // The emoji set, under the note's actions or above the hover tools.
  function picker(button, x) {
    const own = x.member_id === ctx.me.id;
    const mine = new Set((x.reactions ?? []).filter((r) => r.member_id === ctx.me.id).map((r) => r.kind));
    const menu = popup(button, `bk-picker${button.closest('.bk-hover') ? ' is-top' : ''}`, REACTIONS.map((r) => `<button type="button" data-react="${r.kind}"
      aria-pressed="${mine.has(r.kind)}" title="${esc(r.label)}" aria-label="${esc(r.label)}" ${r.kind === 'agree' && own ? 'disabled' : ''}><span class="bk-emo">${r.emoji}</span></button>`).join(''));
    menu.setAttribute('role', 'toolbar');
    menu.setAttribute('aria-label', 'Thả cảm xúc');
    menu.dataset.for = x.id;
    // It floats just above the button that opened it, inside the note.
    const host = menu.parentElement.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(b.left - host.left - 8, host.width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${b.top - host.top - menu.offsetHeight - 6}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  const away = (e) => {
    if (!main.isConnected) { document.removeEventListener('pointerdown', away, true); return; }
    if (!e.target.closest('.bk-pop,.bk-picker,[data-period-menu],[data-picker]')) closeMenus();
  };
  document.addEventListener('pointerdown', away, true);

  /* ---------- The phone sheet of channels and people ---------- */

  let sheet = null;
  function openSheet() {
    sheet?.remove();
    sheet = document.createElement('dialog');
    sheet.className = 'sheet bk-sheet';
    sheet.setAttribute('aria-label', 'Chọn kênh và thành viên');
    document.body.append(sheet);
    paintSheet();
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet || e.target.closest('[data-sheet-done]')) { closeSheet(); return; }
      onClick(e);
      // A row opens that channel or person and closes the sheet; the round buttons add and keep it open.
      if (e.target.closest('[data-solo-person],[data-solo-tag],[data-view]')) closeSheet();
    });
    sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
    sheet.tabIndex = -1;
    sheet.showModal();
    sheet.focus();
  }
  function paintSheet() {
    if (!sheet?.isConnected) return;
    sheet.innerHTML = `<div class="sheet-grip"></div><div class="bk-sheet-h"><h2>Xem insight của</h2>
      <div class="seg bk-seg" role="group" aria-label="Thời gian">${PERIODS.map(([k, l]) => `<button type="button" data-set-period="${k}" aria-pressed="${s.period === k}">${esc(l)}</button>`).join('')}</div></div>
      <div class="bk-nav is-sheet">${navHtml(ctx, view, { sheet: true })}</div>
      <button type="button" class="btn btn-gold wide bk-sheet-go" data-sheet-done>Xem ${view.shown.length} insight</button>`;
  }
  function closeSheet() { sheet?.close(); sheet?.remove(); sheet = null; }

  /* ---------- Clicks ---------- */

  async function onClick(e) {
    const t = e.target;
    if (t.closest('[data-jot]')) return;
    if (t.closest('[data-guide-fold]')) { view.guideFolded = !view.guideFolded; store.set(GUIDE_FOLD, view.guideFolded ? '1' : '0'); main.querySelector('#bk-guide').innerHTML = guideHtml(ctx, view); return; }
    const pick = t.closest('.bk-picker [data-react]');
    if (pick) {
      const x = find(pick.closest('.bk-picker').dataset.for);
      closeMenus();
      if (x) react(x, pick.dataset.react);
      return;
    }
    const solo = t.closest('[data-solo-person],[data-solo-tag]');
    if (solo) {
      const person = solo.dataset.soloPerson;
      // In Lý do sửa bài a person filters the feedback; anywhere else she opens with her notes.
      if (person) setScope({ view: s.view === 'feedback' ? 'feedback' : 'all', people: new Set([person]), tags: new Set() });
      else setScope({ view: 'all', tags: new Set([solo.dataset.soloTag]), people: new Set() });
      return;
    }
    const person = t.closest('[data-person]');
    if (person) {
      // A face or name in the chat opens her alone; the round button in the list adds or removes.
      const keep = s.view === 'feedback' ? 'feedback' : 'all';
      if (person.closest('.bk-msg')) setScope({ view: keep, people: new Set([person.dataset.person]), tags: new Set() });
      else setScope({ view: keep, people: toggle(s.people, person.dataset.person) });
      return;
    }
    // Biến thành insight: the feedback's words open in the quick sheet, with its card, to write as a rule for many posts.
    const fbNote = t.closest('[data-fb-note]');
    if (fbNote) {
      const f = view.feedback?.find?.((x) => x.id === fbNote.closest('[data-fb]').dataset.fb);
      if (!f) return;
      const picking = ['skip', 'dismiss', 'wrong_pick'].includes(f.kind);
      openJotSheet(ctx, { card: f.card_id ? { id: f.card_id, op: f.card_op ?? '' } : null, title: 'Biến thành insight',
        lead: 'Viết lại thành một điều đúng cho nhiều bài, không chỉ bài này. Cả nhóm sẽ thấy trong Insights.',
        prefill: f.text, prefillTags: [picking ? 'chọn bài' : 'viết lại'], draft: `from.${f.id}` });
      return;
    }
    const tag = t.closest('[data-tag]');
    if (tag) { setScope({ view: 'all', tags: toggle(s.tags, tag.dataset.tag) }); return; }
    const v = t.closest('[data-view]');
    if (v) { if (v.dataset.view !== 'replies') view.open.clear(); setScope({ view: v.dataset.view, people: new Set(), tags: new Set() }); return; }
    const p = t.closest('[data-set-period]');
    if (p) { closeMenus(); setScope({ period: p.dataset.setPeriod }); return; }
    if (t.closest('[data-period-menu]')) {
      const b = t.closest('[data-period-menu]');
      if (b.getAttribute('aria-expanded') === 'true') closeMenus(); else periodMenu(b);
      return;
    }
    if (t.closest('[data-reset]')) { Object.assign(s, blank()); view.open.clear(); closeSearch(); paint(); return; }
    if (t.closest('[data-search]')) { if (view.searching) closeSearch(); else openSearch(); return; }
    if (t.closest('[data-search-close]')) { closeSearch(); return; }
    if (t.closest('[data-scope]')) { if (!matchMedia('(min-width:900px)').matches) openSheet(); return; }
    if (t.closest('[data-older]')) { older(); return; }
    if (t.closest('[data-expand]')) { const b = t.closest('[data-expand]'); b.previousElementSibling.classList.remove('is-long'); b.remove(); return; }
    const reply = t.closest('.bk-reply');
    const el = reply ?? t.closest('.bk-msg');
    if (!el) return;
    const x = find(el.dataset.id);
    const noteId = reply ? reply.dataset.parent : el.dataset.id;
    if (t.closest('[data-thread-all]')) { view.full.add(t.closest('.bk-thread').dataset.thread); paint({ keepScroll: true }); return; }
    if (t.closest('[data-thread-close]')) {
      const id = t.closest('.bk-thread').dataset.thread;
      view.open.delete(id);
      paint({ keepScroll: true });
      stream.querySelector(`.bk-msg[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (t.closest('[data-thread-open]')) { openThread(noteId, { focus: true }); return; }
    if (!x || x.pending) return;
    const replyTo = t.closest('[data-reply-to]');
    if (replyTo) { openThread(noteId, { focus: true, mention: x.member_id !== ctx.me.id ? whoName(ctx, x.member_id).name : null }); return; }
    if (t.closest('[data-picker]')) { picker(t.closest('[data-picker]'), x); return; }
    if (t.closest('[data-react]')) { react(x, t.closest('[data-react]').dataset.react); return; }
    if (t.closest('[data-copy]')) { if (await copyText(x.body)) toast('Đã sao chép.'); return; }
    if (t.closest('[data-edit]')) { edit(x, el); return; }
    if (t.closest('[data-delete]')) { remove(x, el); return; }
    if (t.closest('[data-actions]')) actions(x, el);
  }
  main.addEventListener('click', onClick);

  function openThread(id, { focus = false, mention = null } = {}) {
    view.open.add(id);
    paint({ keepScroll: true });
    const box = view.boxes.get(id);
    stream.querySelector(`.bk-thread[data-thread="${CSS.escape(id)}"] .bk-treply`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (mention) box?.mention(mention); else if (focus) box?.focus();
  }

  async function react(x, kind) {
    if (kind === 'agree' && x.member_id === ctx.me.id) return;
    const on = !(x.reactions ?? []).some((r) => r.kind === kind && r.member_id === ctx.me.id);
    const before = x.reactions ?? [];
    const set = (list) => { x.reactions = list; x.agrees = list.filter((r) => r.kind === 'agree').map((r) => r.member_id); };
    set(on ? [...before, { member_id: ctx.me.id, kind }] : before.filter((r) => !(r.kind === kind && r.member_id === ctx.me.id)));
    paint({ keepScroll: true });
    if (on) stream.querySelector(`[data-id="${CSS.escape(x.id)}"] [data-react="${kind}"].bk-react`)?.classList.add('pop');
    try { await reactIntuition(x.id, ctx.me.id, kind, on); } catch (error) {
      console.error(error);
      set(before);
      paint({ keepScroll: true });
      toast('Chưa lưu được. Kiểm tra mạng rồi thử lại.');
    }
  }
  function edit(x, el) {
    const body = el.querySelector(':scope > .bk-msg-main, :scope > .bk-reply-main');
    const host = document.createElement('div');
    host.className = 'bk-edit';
    host.innerHTML = composerHtml(ctx, { variant: 'edit', initial: x });
    body.querySelectorAll(':scope > :not(.bk-msg-h):not(.bk-thread)').forEach((n) => { n.hidden = true; });
    const head = body.querySelector(':scope > .bk-msg-h');
    if (head) head.after(host); else body.prepend(host);
    el.classList.add('is-editing');
    const c = wireComposer(host.querySelector('[data-jot]'), ctx, { variant: 'edit', initial: x,
      onSaved: (row) => { Object.assign(x, row, { reactions: x.reactions, agrees: x.agrees }); paint({ keepScroll: true }); toast('Đã lưu.'); },
      onCancel: () => paint({ keepScroll: true }) });
    c.focus();
  }
  async function remove(x, el) {
    if (!(await confirmDelete(Boolean(x.parent_id), (view.replies.get(x.id) ?? []).length))) return;
    el.classList.add('is-leaving');
    try {
      await deleteIntuition(x.id);
      if (x.parent_id) view.replies.set(x.parent_id, (view.replies.get(x.parent_id) ?? []).filter((r) => r.id !== x.id));
      else view.list = view.list.filter((r) => r.id !== x.id);
      setTimeout(() => paint({ keepScroll: true }), 200);
      toast(x.parent_id ? 'Đã xoá câu trả lời.' : 'Đã xoá insight.');
    } catch (error) { console.error(error); el.classList.remove('is-leaving'); toast('Chưa xoá được. Thử lại sau.'); }
  }
  // A phone has no hover: a sheet holds the emoji row and the same actions.
  function actions(x, el) {
    const mine = x.member_id === ctx.me.id;
    const chosen = new Set((x.reactions ?? []).filter((r) => r.member_id === ctx.me.id).map((r) => r.kind));
    const d = document.createElement('dialog');
    d.className = 'sheet bk-acts-sheet';
    d.innerHTML = `<div class="sheet-grip"></div><p class="bk-acts-q">${esc(firstLine(x.body, 90))}</p>
      <div class="bk-acts-emo">${REACTIONS.map((r) => `<button type="button" data-a="react" data-kind="${r.kind}" aria-pressed="${chosen.has(r.kind)}" ${r.kind === 'agree' && mine ? 'disabled' : ''}
        aria-label="${esc(r.label)}"><span class="bk-emo">${r.emoji}</span><small>${esc(r.label)}</small></button>`).join('')}</div>
      <button type="button" data-a="reply">${icon('reply')}Trả lời</button>
      <button type="button" data-a="copy">${icon('copy')}Sao chép</button>
      <button type="button" data-a="person">${icon('user')}Xem insight của ${esc(whoName(ctx, x.member_id).name)}</button>
      ${mine ? `<button type="button" data-a="edit">${icon('pen')}Sửa</button><button type="button" data-a="delete" class="is-warn">${icon('close')}Xoá</button>` : ''}`;
    document.body.append(d);
    const close = () => { d.close(); d.remove(); };
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (e.target === d) { close(); return; }
      if (!b) return;
      close();
      const a = b.dataset.a;
      if (a === 'react') react(x, b.dataset.kind);
      if (a === 'reply') openThread(x.parent_id ?? x.id, { focus: true, mention: x.parent_id && !mine ? whoName(ctx, x.member_id).name : null });
      if (a === 'copy' && await copyText(x.body)) toast('Đã sao chép.');
      if (a === 'person') setScope({ view: 'all', people: new Set([x.member_id]), tags: new Set() });
      if (a === 'edit') edit(x, el);
      if (a === 'delete') remove(x, el);
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.tabIndex = -1;
    d.showModal();
    d.focus();
  }

  // Back on the tab, the chat reads again; new notes from others land at the bottom, or behind a "Insights mới" pill.
  const back = async () => {
    if (!main.isConnected) { document.removeEventListener('visibilitychange', back); return; }
    if (document.visibilityState !== 'visible') return;
    try {
      const fresh = await loadIntuitions();
      const sig = (l) => JSON.stringify(l.filter((x) => !x.pending).map((x) => [x.id, x.reactions?.length, x.edited_at, x.outcome]).sort());
      const mine = [...view.list, ...[...view.replies.values()].flat()];
      if (sig(fresh) === sig(mine)) return;
      const atEnd = nearBottom();
      const split = splitThreads(fresh);
      view.list = [...split.notes, ...view.list.filter((x) => x.pending)];
      view.replies = split.replies;
      learnTags(view.list);
      paint({ keepScroll: true });
      if (atEnd) toBottom(true); else jump.hidden = false;
      fillCards();
    } catch { /* offline: keep what is on screen */ }
  };
  document.addEventListener('visibilitychange', back);
}

function confirmDelete(isReply, replyCount) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'sheet bk-confirm';
    dialog.innerHTML = `<div class="sheet-grip"></div><h2>${isReply ? 'Xoá câu trả lời này?' : 'Xoá insight này?'}</h2>
      <p class="muted">${isReply ? 'Cả nhóm sẽ không thấy nó nữa.' : replyCount ? `Cả nhóm sẽ không thấy nó và ${replyCount} câu trả lời bên dưới nữa.` : 'Cả nhóm sẽ không thấy nó nữa.'}</p>
      <div class="row-actions"><button type="button" class="btn btn-line" data-no>Giữ lại</button><button type="button" class="btn btn-ink" data-yes>Xoá</button></div>`;
    document.body.append(dialog);
    const done = (v) => { dialog.close(); dialog.remove(); resolve(v); };
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-no]')) done(false);
      if (e.target.closest('[data-yes]')) done(true);
    });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    dialog.showModal();
  });
}

// Kho bài's bar: the composer, then a line on what the team wrote since her last visit to Insights.
export function inlineHtml(ctx) {
  return `<section class="bk-inline" aria-label="Ghi insight">${composerHtml(ctx, { variant: 'inline' })}<p class="bk-inline-foot" id="bk-inline-foot"></p></section>`;
}
export async function wireInline(root, ctx) {
  const foot = root.querySelector('#bk-inline-foot');
  const paintFoot = async () => {
    try {
      const all = await loadIntuitions();
      learnTags(all);
      const seen = store.get(SEEN);
      const n = newsFor(all, ctx.me.id, seen);
      const { notes } = splitThreads(all);
      const who = [...new Set(notes.filter((x) => x.member_id !== ctx.me.id && seen && x.created_at > seen).map((x) => x.member_id))].slice(0, 3);
      if (!foot.isConnected) return;
      const parts = [n.unseen.total ? `<b>${n.unseen.total} insight mới</b>` : '', n.replies.toMe.size ? `<b>${n.replies.toMe.size} cuộc trả lời bạn</b>` : ''].filter(Boolean);
      foot.innerHTML = parts.length
        ? `<a href="#/insights"><span class="bk-faces">${who.map((id) => face(whoName(ctx, id), 'xs')).join('')}</span><span>${parts.join(' · ')} trong Insights</span>${icon('right')}</a>`
        : notes.length ? `<a href="#/insights"><span>Mở Insights của cả nhóm · ${notes.length} insight</span>${icon('right')}</a>` : '';
    } catch { foot.innerHTML = ''; }
  };
  wireComposer(root.querySelector('[data-jot]'), ctx, { variant: 'inline',
    onSent: (row) => { sentToast(row); paintFoot(); } });
  paintFoot();
}
