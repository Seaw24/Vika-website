import { saveSettings, loadTeam, signOut } from '../data.js';
import { hasLinkSlot, isValidAccountCode, fillTemplate, appLink, buildCt } from '../lib/ct.js';
import { esc, toast, icon, initial, autoGrow } from '../ui.js';
import { settingsFor } from './shared.js';

// The preview shows the reply as Threads will, with the link standing out where {link} sits.
function preview(template, code, handle) {
  const link = appLink(buildCt(code, 'giapt'));
  const body = String(template).split('{link}').map(esc).join(`<span class="link">${esc(link)}</span>`);
  return `<i class="av sm">${esc(initial(handle.split('.').at(-1)))}</i><div><b>@${esc(handle)}</b><p class="plain">${body || '<span class="muted">Trống</span>'}</p></div>`;
}

function form(ctx, account) {
  const s = settingsFor(ctx, account);
  return `<form class="panel acct-form" data-account="${esc(account.id)}">
    <div class="top-row"><h2>@${esc(account.handle)}</h2><span class="tag ${account.kind === 'card' ? '' : 'gold'}">${account.kind === 'card' ? 'Đăng bài' : 'Sáng tạo'}</span></div>
    <div class="field"><div class="label-row"><span>Bình luận 2 của tài khoản này</span><button type="button" class="insert" data-insert>${icon('link')}Chèn {link}</button></div>
      <textarea name="template" aria-label="Bình luận 2 của @${esc(account.handle)}" rows="3">${esc(s.r2_template)}</textarea></div>
    <p class="warn" data-warn${hasLinkSlot(s.r2_template) ? ' hidden' : ''}>${icon('info')}Chưa có {link}: bình luận 2 sẽ không có link tải app.</p>
    <label class="field"><span>Mã tài khoản trong link · chữ thường và số, tối đa 20 ký tự</span>
      <input name="code" value="${esc(s.account_code)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
    <div><p class="eyebrow" style="margin:18px 0 0">Xem trước</p><div class="bubble" data-preview></div></div>
    <div class="save"><button class="btn btn-ink" type="submit">Lưu</button><span class="tiny muted" data-status></span></div></form>`;
}

function wire(ctx, f) {
  const account = ctx.team.accounts.find((a) => a.id === f.dataset.account);
  const area = f.elements.template;
  autoGrow(area);
  const refresh = () => {
    const code = f.elements.code.value.trim();
    f.querySelector('[data-warn]').hidden = hasLinkSlot(area.value);
    f.querySelector('[data-preview]').innerHTML = isValidAccountCode(code)
      ? preview(area.value, code, account.handle)
      : '<span></span><p class="warn" style="margin:0">Mã chỉ gồm chữ thường a-z và số, 1 đến 20 ký tự.</p>';
    f.querySelector('[data-status]').textContent = '';
  };
  f.oninput = refresh;
  refresh();
  f.querySelector('[data-insert]').onclick = () => {
    const at = area.selectionStart ?? area.value.length;
    area.setRangeText('{link}', at, area.selectionEnd ?? at, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const code = f.elements.code.value.trim();
    if (!isValidAccountCode(code)) {
      toast('Mã tài khoản chưa đúng.');
      return;
    }
    if (ctx.team.settings.some((s) => s.account_code === code && s.account_id !== account.id)) {
      toast('Mã này tài khoản khác đang dùng.');
      return;
    }
    const button = f.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await saveSettings({ account_id: account.id, r2_template: area.value, account_code: code });
      ctx.team = await loadTeam();
      toast('Đã lưu.');
      f.querySelector('[data-status]').textContent = 'Đã lưu. Bài chọn từ giờ dùng bản này.';
    } catch (error) {
      console.error(error);
      toast('Chưa lưu được. Thử lại nhé.');
    } finally {
      button.disabled = false;
    }
  };
}

export async function renderSettings(main, ctx) {
  const mine = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id);
  main.innerHTML = `<div class="page-head"><div><p class="eyebrow">Cài đặt</p><h1 class="page-title">Tài khoản của bạn</h1>
      <p class="sub">Bình luận 2 và mã link của từng tài khoản. Đặt {link} ở chỗ cần link tải app.</p></div></div>
    <section class="panel sand profile"><i class="av">${esc(initial(ctx.me.name))}</i><div><b>${esc(ctx.me.name)}</b><span class="small muted">${esc(ctx.me.email)}</span></div>
      <button class="btn btn-line sm out" id="out">Đăng xuất</button></section>
    ${mine.map((a) => form(ctx, a)).join('') || '<div class="empty" style="margin-top:12px"><h2>Chưa có tài khoản</h2><p>Nhắn Nam để được thêm.</p></div>'}`;
  main.querySelectorAll('form[data-account]').forEach((f) => wire(ctx, f));
  main.querySelector('#out').onclick = () => signOut();
}
