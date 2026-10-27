const VN = 'Asia/Ho_Chi_Minh';
const vnFormat = new Intl.DateTimeFormat('en-CA', { timeZone: VN, year: 'numeric', month: '2-digit', day: '2-digit' });

export const vnDate = (date = new Date()) => vnFormat.format(date);

export function mondayOf(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const byTime = (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id;
const CHOICE_EVENTS = ['chose_account', 'undo_choice', 'choice_expired', 'skipped', 'posted', 'posted_undo'];

export function choiceState(events) {
  const state = new Map();
  const choices = events.filter((e) => ['chose_account', 'undo_choice', 'choice_expired', 'skipped'].includes(e.type)).sort(byTime);
  for (const e of choices) {
    if (e.type === 'chose_account') state.set(e.assignment_id, { account_id: e.account_id, at: e.at, ct: e.payload?.ct ?? null });
    else state.delete(e.assignment_id);
  }
  return state;
}

// Where each card stands. The member only says she posted it (Nam, 2026-09-27): she no longer picks an
// account, because the daily read finds the post on whichever of her accounts it went out. Her tap makes a
// claim; only a posts row, written by the daily read, confirms it and names the account. An expiry that
// lands on a claim is kept as "missing" so the page can say the read did not find the post.
// Older chose_account events only lend their link code, so a card copied under the old flow keeps its link.
//   claimed   { at, posted_at, ct }
//   missing   + expired_at                       (the card itself is back in the library)
//   confirmed + account_id, published_at, post   (posted_at when the member tapped)
export function postingState(events, posts = []) {
  const state = new Map();
  for (const e of events.filter((e) => CHOICE_EVENTS.includes(e.type)).sort(byTime)) {
    const cur = state.get(e.assignment_id);
    if (e.type === 'posted') { if (!cur || cur.status === 'missing') state.set(e.assignment_id, { status: 'claimed', at: e.at, posted_at: e.at, ct: e.payload?.ct ?? null }); }
    else if (e.type === 'posted_undo') { if (cur?.status === 'claimed') state.delete(e.assignment_id); }
    else if (e.type === 'choice_expired') { if (cur?.status === 'claimed') state.set(e.assignment_id, { ...cur, status: 'missing', expired_at: e.at }); }
    else if (e.type === 'skipped' && cur?.status !== 'claimed') state.delete(e.assignment_id);
  }
  for (const post of posts) {
    if (!post.assignment_id) continue;
    const cur = state.get(post.assignment_id);
    state.set(post.assignment_id, { status: 'confirmed', account_id: post.account_id, at: cur?.at ?? null, ct: post.ct ?? cur?.ct ?? null,
      posted_at: cur?.posted_at ?? null, published_at: post.published_at, post });
  }
  return state;
}

// Cards she set aside, with Không dùng bài này or the Sunday review, until she takes one back with Dùng lại
// (Nam, 2026-09-28).
export function skippedIds(events) {
  const out = new Set();
  for (const e of events.filter((e) => ['skipped', 'skip_undo'].includes(e.type)).sort(byTime)) {
    if (e.type === 'skipped') out.add(e.assignment_id); else out.delete(e.assignment_id);
  }
  return out;
}

// The link code a card already carries: the latest one the member copied or tapped under, if any.
export function issuedCt(events, assignmentId) {
  return events.filter((e) => e.assignment_id === assignmentId && e.payload?.ct
    && (['chose_account', 'posted'].includes(e.type) || (e.type === 'copied' && e.payload.part === 'r2')))
    .sort(byTime).at(-1)?.payload.ct ?? null;
}

// Hôm nay holds every card she has not used, from all her weeks (Nam, 2026-10-26: one queue). A card belongs to
// the member with its newest assignment: an unused card goes back to the spare pool, and the next push or a
// top-up may deal it to someone else, or to her again. Her older copy then leaves her queue, and so does a card
// someone else posted. holders are every assignment of her cards { card_id, week_id }; cardPosts every post of them.
export function heldIds(assignments, holders, cardPosts = []) {
  const newest = new Map();
  for (const h of [...holders, ...assignments.map((a) => ({ card_id: a.card.id, week_id: a.week_id }))]) {
    if (!(newest.get(h.card_id) >= h.week_id)) newest.set(h.card_id, h.week_id);
  }
  const mine = new Set(assignments.map((a) => a.id));
  const postedElsewhere = new Set(cardPosts.filter((p) => !mine.has(p.assignment_id)).map((p) => p.card_id));
  return new Set(assignments.filter((a) => a.week_id >= newest.get(a.card.id) && !postedElsewhere.has(a.card.id)).map((a) => a.id));
}

// Cards with no standing choice: the newest week first, then the picker's order. A missing card is free again.
export const remaining = (assignments, states) =>
  assignments.filter((a) => !states.has(a.id) || states.get(a.id).status === 'missing')
    .sort((a, b) => String(b.week_id ?? '').localeCompare(String(a.week_id ?? '')) || a.suggested_order - b.suggested_order);

const dayOf = (iso) => (iso ? vnDate(new Date(iso)) : null);
// The day a post counts for: the member's own tap, or the read's publish time when there was no tap.
export const postedDay = (s) => dayOf(s.posted_at ?? s.published_at);

const postedAt = (s) => Date.parse(s.posted_at ?? s.published_at);

// The panel always holds the next cards nobody has marked posted, one per slot (a slot per card account).
// A card leaves it the moment she taps Đã đăng xong and waits on the ledger for the read (Nam, 2026-09-27).
//   open   a card to post
//   empty  the set ran out
export function todayPlan({ assignments, slots, states }) {
  const open = remaining(assignments, states).slice(0, slots).map((a) => ({ assignment: a, status: 'open' }));
  return open.length ? open : [{ assignment: null, status: 'empty' }];
}

// Cards that went out today, claimed or confirmed.
export const postedToday = (assignments, states, today) => assignments.filter((a) => ['claimed', 'confirmed'].includes(states.get(a.id)?.status)
  && postedDay(states.get(a.id)) === today).length;

// The week as seven columns with one dot per slot: that day's first, second … post, confirmed or claimed.
// states may hold cards of any week, so only posts dated inside this one count.
export function weekStrip({ weekId, today, slots, states }) {
  const end = addDays(weekId, 6);
  const posted = [...states.values()].filter((s) => ['claimed', 'confirmed'].includes(s.status) && postedDay(s) >= weekId && postedDay(s) <= end);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekId, i);
    const here = posted.filter((s) => postedDay(s) === date).sort((a, b) => postedAt(a) - postedAt(b));
    const dots = Array.from({ length: slots }, (_, r) => ({ status: here[r]?.status ?? 'none' }));
    return { date, dots, count: here.length, when: date < today ? 'past' : date === today ? 'today' : 'future' };
  });
  return { days, posted: posted.length, waiting: posted.filter((s) => s.status === 'claimed').length };
}
