import { cleanAccountCode } from '../lib/ct.js';
import { wordDiff } from '../lib/diff.js';
import { esc } from '../ui.js';

export const DEFAULT_TEMPLATE = 'Tải app Vika ở đây nha:\n{link}';

export function settingsFor(ctx, account) {
  const s = ctx.team.settings.find((x) => x.account_id === account.id);
  return {
    r2_template: s?.r2_template ?? DEFAULT_TEMPLATE,
    account_code: s?.account_code ?? cleanAccountCode(account.handle),
    created_at: s?.created_at ?? null,
  };
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

// A new link code from a name, never one another account already uses. Her own accounts' codes do not count.
export function freshCode(ctx, name, ownIds = []) {
  const taken = new Set(ctx.team.settings.filter((s) => !ownIds.includes(s.account_id)).map((s) => s.account_code));
  const base = cleanAccountCode(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const code = `${base.slice(0, 20 - String(n).length)}${n}`;
    if (!taken.has(code)) return code;
  }
}

// Her Bình luận 2 and link code belong to her, not to one Threads account (Nam, 2026-09-27: "nam_", not
// "nganneez_"). They are stored on her first seeding account; until she saves them the code comes from her name.
export function memberR2(ctx, memberId) {
  const account = homeAccount(ctx, memberId);
  if (!account) return null;
  const row = ctx.team.settings.find((x) => x.account_id === account.id);
  if (row) return { account, r2_template: row.r2_template, account_code: row.account_code, created_at: row.created_at };
  const own = ctx.team.accounts.filter((a) => a.member_id === memberId).map((a) => a.id);
  const name = ctx.team.members?.find((m) => m.id === memberId)?.name ?? account.handle;
  return { account, r2_template: DEFAULT_TEMPLATE, account_code: freshCode(ctx, name, own), created_at: null };
}

// One block that shows the change in place: removed words struck in rust, added words lit in gold.
export function diffHtml(before, after, { from = 'Trước', to = 'Sau' } = {}) {
  const parts = wordDiff(before, after).map((p) => p.type === 'same' ? esc(p.text)
    : p.type === 'del' ? `<del>${esc(p.text)}</del>` : `<ins>${esc(p.text)}</ins>`).join('');
  return `<div class="diff">${parts || '<span class="muted">Trống</span>'}</div>
    <p class="diff-key"><del>${esc(from)}</del><ins>${esc(to)}</ins></p>`;
}
