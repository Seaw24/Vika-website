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

// Where each card stands after its choice. The member's own "posted" tap makes a claim; only a posts
// row, written by the daily read, confirms it. An expiry that lands on a claim is kept as "missing"
// so the page can say the read did not find the post, until a new choice replaces it.
//   chosen    { account_id, at, ct }
//   claimed   + posted_at
//   missing   + posted_at, expired_at            (the card itself is back in the library)
//   confirmed + published_at, post               (posted_at and at when the events exist)
export function postingState(events, posts = []) {
  const state = new Map();
  for (const e of events.filter((e) => CHOICE_EVENTS.includes(e.type)).sort(byTime)) {
    const cur = state.get(e.assignment_id);
    if (e.type === 'chose_account') state.set(e.assignment_id, { status: 'chosen', account_id: e.account_id, at: e.at, ct: e.payload?.ct ?? null });
    else if (e.type === 'posted') { if (cur?.status === 'chosen') state.set(e.assignment_id, { ...cur, status: 'claimed', posted_at: e.at, ct: e.payload?.ct ?? cur.ct }); }
    else if (e.type === 'posted_undo') { if (cur?.status === 'claimed') { const { posted_at, ...rest } = cur; state.set(e.assignment_id, { ...rest, status: 'chosen' }); } }
    else if (e.type === 'choice_expired' && cur?.status === 'claimed') state.set(e.assignment_id, { ...cur, status: 'missing', expired_at: e.at });
    else state.delete(e.assignment_id);
  }
  for (const post of posts) {
    if (!post.assignment_id) continue;
    const cur = state.get(post.assignment_id);
    state.set(post.assignment_id, { status: 'confirmed', account_id: post.account_id, at: cur?.at ?? null, ct: post.ct ?? cur?.ct ?? null,
      posted_at: cur?.posted_at ?? null, published_at: post.published_at, post });
  }
  return state;
}

// Cards with no standing choice, in the picker's order. A missing card is free again.
export const remaining = (assignments, states) =>
  assignments.filter((a) => !states.has(a.id) || states.get(a.id).status === 'missing').sort((a, b) => a.suggested_order - b.suggested_order);

const dayOf = (iso) => (iso ? vnDate(new Date(iso)) : null);
// The day a post counts for: the member's own tap, or the read's publish time when there was no tap.
const postedDay = (s) => dayOf(s.posted_at ?? s.published_at);

// One ticket per card account.
//   chosen  the card in progress (stale when the choice is from another day)
//   done    a post went out today on this account; the next card is up for tomorrow (assignment may be null)
//   open    the next card
//   empty   the set ran out
export function todayPlan({ assignments, cardAccounts, states, today }) {
  const open = remaining(assignments, states);
  let next = 0;
  const entry = (a) => ({ ...states.get(a.id), assignment: a });
  return cardAccounts.map((account) => {
    const mine = assignments.filter((a) => states.has(a.id)).map(entry).filter((s) => s.account_id === account.id);
    const chosen = mine.find((s) => s.status === 'chosen');
    if (chosen) return { account, assignment: chosen.assignment, status: 'chosen', stale: dayOf(chosen.at) !== today, since: chosen.at };
    const doneToday = mine.filter((s) => ['claimed', 'confirmed'].includes(s.status) && postedDay(s) === today)
      .sort((a, b) => Date.parse(b.posted_at ?? b.published_at) - Date.parse(a.posted_at ?? a.published_at))[0] ?? null;
    const suggestion = open[next] ?? null;
    if (suggestion) next += 1;
    if (doneToday) return { account, assignment: suggestion, status: 'done', done: doneToday.assignment, doneState: doneToday };
    return { account, assignment: suggestion, status: suggestion ? 'open' : 'empty' };
  });
}

// The week as seven columns with one dot per card account: confirmed, claimed or none.
export function weekStrip({ weekId, today, cardAccounts, states }) {
  const posted = [...states.values()].filter((s) => ['claimed', 'confirmed'].includes(s.status));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekId, i);
    const dots = cardAccounts.map((account) => {
      const here = posted.filter((s) => s.account_id === account.id && postedDay(s) === date);
      const status = here.some((s) => s.status === 'confirmed') ? 'confirmed' : here.length ? 'claimed' : 'none';
      return { account, status, count: here.length };
    });
    return { date, dots, when: date < today ? 'past' : date === today ? 'today' : 'future' };
  });
  return { days, posted: posted.length, waiting: posted.filter((s) => s.status === 'claimed').length };
}
