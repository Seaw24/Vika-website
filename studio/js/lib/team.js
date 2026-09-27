import { addDays, mondayOf, postingState, vnDate } from './week.js';

const dayOf = (iso) => (iso ? vnDate(new Date(iso)) : null);
const POSTED = ['claimed', 'confirmed'];

// The owner's view: every member's posts as dated items, in Vietnam time.
// A card post counts on the day the member tapped "Đã đăng xong" (or the read's publish time
// when there was no tap); a card chosen but never marked posted sits on the day it was chosen.
// Creative posts have no assignment and come straight from the read.
//   item { kind: 'card'|'creative', status: chosen|claimed|missing|confirmed, at, day, member, account, assignment, post }
export function teamItems({ members, accounts, assignments, events, posts }) {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const states = postingState(events, posts.filter((p) => p.assignment_id));
  const items = [];
  for (const a of assignments) {
    const s = states.get(a.id);
    if (!s) continue;
    const at = s.status === 'chosen' ? s.at : s.posted_at ?? s.published_at;
    const account = accountById.get(s.account_id) ?? null;
    const member = memberById.get(account?.member_id ?? a.member_id);
    if (member) items.push({ kind: 'card', status: s.status, at, day: dayOf(at), member, account, assignment: a, post: s.post ?? null });
  }
  for (const p of posts.filter((p) => !p.assignment_id)) {
    const account = accountById.get(p.account_id);
    const member = memberById.get(account?.member_id);
    if (member) items.push({ kind: 'creative', status: 'confirmed', at: p.published_at, day: dayOf(p.published_at), member, account, assignment: null, post: p });
  }
  return items;
}

// Calendar weeks (their Mondays) from the first item to this week, newest first.
export function teamWeekIds(items, today) {
  const current = mondayOf(today);
  const first = items.map((it) => mondayOf(it.day)).sort()[0] ?? current;
  const out = [];
  for (let w = current; w >= first; w = addDays(w, -7)) out.push(w);
  return out;
}

// One calendar week: seven days with their items (newest first) and counts per member.
export function teamWeek({ weekId, today, members, items }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekId, i)).map((date) => {
    const list = items.filter((it) => it.day === date).sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
    const perMember = members.map((member) => {
      const mine = list.filter((it) => it.member.id === member.id);
      return {
        member,
        posted: mine.filter((it) => POSTED.includes(it.status)).length,
        confirmed: mine.filter((it) => it.status === 'confirmed').length,
        open: mine.filter((it) => it.status === 'chosen').length,
      };
    });
    return { date, when: date < today ? 'past' : date === today ? 'today' : 'future', items: list, perMember };
  });
  const totals = members.map((member) => ({
    member,
    posted: days.reduce((n, d) => n + d.perMember.find((p) => p.member.id === member.id).posted, 0),
  }));
  return { days, totals };
}
