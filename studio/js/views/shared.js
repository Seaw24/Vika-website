import { cleanAccountCode } from '../lib/ct.js';
import { wordDiff } from '../lib/diff.js';
import { esc } from '../ui.js?v=20261104f';

// The team's locked Bình luận 2 pitch (vika-ops tools/threads-writer/R2.txt, its App Store link as {link}), for a
// member who never saved her own (Nam, 2026-10-17).
export const DEFAULT_TEMPLATE = 'Mng ai mà muốn giảm cân, giảm mỡ hiệu quả thì recommend thật lòng là phải tải cái app Vika luôn nhé, free mà xịn cực. Như kiểu có PT sửa form + đếm rep cho mình trong lúc tập luôn ý:\n{link}';

export function settingsFor(ctx, account) {
  const s = ctx.team.settings.find((x) => x.account_id === account.id);
  return {
    r2_template: s?.r2_template ?? DEFAULT_TEMPLATE,
    account_code: linkCode(ctx, account),
    created_at: s?.created_at ?? null,
  };
}

// Each account's link code is its own: its handle, until someone changes it in Cài đặt (Nam, 2026-11-04: "default it
// into the account name ... still the same R2"). A code never repeats another account's, hers or not.
export function linkCode(ctx, account) {
  return ctx.team.settings.find((x) => x.account_id === account.id)?.account_code ?? freshCode(ctx, account.handle, [account.id]);
}

// A member's first card account carries the Bình luận 2 template and the link code for all her card posts
// (Nam, 2026-09-27): she no longer picks an account, so one template serves both. A slot still named by
// setup (like thaiha.2) is never the first while a real handle exists. First means oldest, so an account she
// adds later never takes over the link code; a retired one hands over to the next while any is in use.
export const SETUP_NAME = /^[a-z]+\.(1|2|creative)$/;
export const isActive = (account) => account.active !== false;
const byAge = (a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.handle.localeCompare(b.handle);
export function homeAccount(ctx, memberId) {
  const cards = ctx.team.accounts.filter((a) => a.member_id === memberId && a.kind === 'card').sort(byAge);
  const pick = (list) => list.find((a) => !SETUP_NAME.test(a.handle)) ?? list[0] ?? null;
  return pick(cards.filter(isActive)) ?? pick(cards);
}

// The accounts she can post a card on, oldest first: her live seeding accounts with a real handle, or the setup slots
// while she has nothing else.
export function postAccounts(ctx, memberId) {
  const live = ctx.team.accounts.filter((a) => a.member_id === memberId && a.kind === 'card' && isActive(a)).sort(byAge);
  const real = live.filter((a) => !SETUP_NAME.test(a.handle));
  return real.length ? real : live;
}

// A new link code from a name, never one another account already uses. The accounts in ownIds do not count.
export function freshCode(ctx, name, ownIds = []) {
  const taken = new Set(ctx.team.settings.filter((s) => !ownIds.includes(s.account_id)).map((s) => s.account_code));
  const base = cleanAccountCode(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const code = `${base.slice(0, 20 - String(n).length)}${n}`;
    if (!taken.has(code)) return code;
  }
}

// Her Bình luận 2 text is hers, one for every seeding account, stored on her first seeding account (Nam,
// 2026-09-27). Its link code is that account's own (Nam, 2026-11-04); a card's link takes the code of the account she
// posts it on.
export function memberR2(ctx, memberId) {
  const account = homeAccount(ctx, memberId);
  if (!account) return null;
  const row = ctx.team.settings.find((x) => x.account_id === account.id);
  return { account, r2_template: row?.r2_template ?? DEFAULT_TEMPLATE, account_code: linkCode(ctx, account), created_at: row?.created_at ?? null };
}

// One block that shows the change in place: removed words struck in rust, added words lit in gold.
export function diffHtml(before, after, { from = 'Trước', to = 'Sau' } = {}) {
  const parts = wordDiff(before, after).map((p) => p.type === 'same' ? esc(p.text)
    : p.type === 'del' ? `<del>${esc(p.text)}</del>` : `<ins>${esc(p.text)}</ins>`).join('');
  return `<div class="diff">${parts || '<span class="muted">Trống</span>'}</div>
    <p class="diff-key"><del>${esc(from)}</del><ins>${esc(to)}</ins></p>`;
}
