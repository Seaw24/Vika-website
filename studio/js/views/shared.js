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

// One block that shows the change in place: removed words struck in rust, added words lit in gold.
export function diffHtml(before, after, { from = 'Trước', to = 'Sau' } = {}) {
  const parts = wordDiff(before, after).map((p) => p.type === 'same' ? esc(p.text)
    : p.type === 'del' ? `<del>${esc(p.text)}</del>` : `<ins>${esc(p.text)}</ins>`).join('');
  return `<div class="diff">${parts || '<span class="muted">Trống</span>'}</div>
    <p class="diff-key"><del>${esc(from)}</del><ins>${esc(to)}</ins></p>`;
}
