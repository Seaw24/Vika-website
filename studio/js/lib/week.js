const VN = 'Asia/Ho_Chi_Minh';
const vnFormat = new Intl.DateTimeFormat('en-CA', { timeZone: VN, year: 'numeric', month: '2-digit', day: '2-digit' });

export const vnDate = (date = new Date()) => vnFormat.format(date);

export function mondayOf(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const byTime = (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id;

export function choiceState(events) {
  const state = new Map();
  const choices = events.filter((e) => ['chose_account', 'undo_choice', 'choice_expired', 'skipped'].includes(e.type)).sort(byTime);
  for (const e of choices) {
    if (e.type === 'chose_account') state.set(e.assignment_id, { account_id: e.account_id, at: e.at, ct: e.payload?.ct ?? null });
    else state.delete(e.assignment_id);
  }
  return state;
}

export const remaining = (assignments, choices) =>
  assignments.filter((a) => !choices.has(a.id)).sort((a, b) => a.suggested_order - b.suggested_order);

export function todayPlan({ assignments, cardAccounts, choices, today }) {
  const open = remaining(assignments, choices);
  let next = 0;
  return cardAccounts.map((account) => {
    const chosenToday = assignments.find((a) => {
      const c = choices.get(a.id);
      return c && c.account_id === account.id && vnDate(new Date(c.at)) === today;
    });
    if (chosenToday) return { account, assignment: chosenToday, status: 'chosen' };
    const suggestion = open[next] ?? null;
    if (suggestion) next += 1;
    return { account, assignment: suggestion, status: suggestion ? 'open' : 'empty' };
  });
}
