import { saveSettings, saveMemberName, saveHandle, loadTeam, signOut } from '../data.js';
import { hasLinkSlot, isValidAccountCode, appLink, buildCt } from '../lib/ct.js';
import { esc, toast, icon, initial, autoGrow } from '../ui.js';
import { settingsFor } from './shared.js';

const HANDLE = /^[a-z0-9._]{1,30}$/;
// Accepts "@name", "name" or a pasted profile link like threads.com/@name.
const cleanHandle = (v) => String(v).trim().replace(/^https?:\/\/(www\.)?threads\.(net|com)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase();

const failure = (error, what) => error?.code === '23505' ? `${what} này đã có người dùng.`
  : error?.code === '23514' ? `${what} chưa đúng dạng.` : 'Chưa lưu được. Thử lại nhé.';

// The preview shows the reply as Threads will, with the link standing out where {link} sits.
function preview(template, code, handle) {
  const link = appLink(buildCt(code, 'giapt'));
  const body = String(template).split('{link}').map(esc).join(`<span class="link">${esc(link)}</span>`);
  return `<i class="av sm">${esc(initial(handle.split('.').at(-1)))}</i><div><b>@${esc(handle)}</b><p class="plain">${body || '<span class="muted">Trống</span>'}</p></div>`;
}

function profile(ctx) {
  return `<form class="panel sand profile-form" id="profile">
    <div class="profile"><i class="av" data-initial>${esc(initial(ctx.me.name))}</i>
      <div class="grow"><b data-name>${esc(ctx.me.name)}</b><span class="small muted">${esc(ctx.me.email)}</span></div>
      <button type="button" class="btn btn-line sm out" id="out">Đăng xuất</button></div>
    <label class="field"><span>Tên của bạn trong nhóm</span>
      <span class="inline-save"><input name="name" value="${esc(ctx.me.name)}" maxlength="60" autocomplete="name">
      <button class="btn btn-ink" type="submit">Lưu</button></span></label></form>`;
}

function form(ctx, account) {
  const s = settingsFor(ctx, account);
  return `<form class="panel acct-form" data-account="${esc(account.id)}">
    <div class="top-row"><h2 data-title>@${esc(account.handle)}</h2><span class="tag ${account.kind === 'card' ? '' : 'gold'}">${account.kind === 'card' ? 'Đăng bài' : 'Sáng tạo'}</span></div>
    <label class="field"><span>Tên tài khoản Threads</span>
      <span class="at-input"><i>@</i><input name="handle" value="${esc(account.handle)}" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="80" placeholder="ten.tai.khoan"></span></label>
    <p class="warn" data-handle-warn hidden>${icon('info')}Chỉ chữ thường, số, dấu chấm và gạch dưới, tối đa 30 ký tự.</p>
    <div class="field"><div class="label-row"><span>Bình luận 2 của tài khoản này</span><button type="button" class="insert" data-insert>${icon('link')}Chèn {link}</button></div>
      <textarea name="template" aria-label="Bình luận 2 của @${esc(account.handle)}" rows="3">${esc(s.r2_template)}</textarea></div>
    <p class="warn" data-warn${hasLinkSlot(s.r2_template) ? ' hidden' : ''}>${icon('info')}Chưa có {link}: bình luận 2 sẽ không có link tải app.</p>
    <label class="field"><span>Mã tài khoản trong link · chữ thường và số, tối đa 20 ký tự</span>
      <input name="code" value="${esc(s.account_code)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
    <div><p class="eyebrow" style="margin:18px 0 0">Xem trước</p><div class="bubble" data-preview></div></div>
    <div class="save"><button class="btn btn-ink" type="submit">Lưu</button><span class="tiny muted" data-status></span></div></form>`;
}

function wireProfile(ctx, f) {
  f.onsubmit = async (e) => {
    e.preventDefault();
    const name = f.elements.name.value.trim().replace(/\s+/g, ' ');
    if (!name) { toast('Tên chưa được để trống.'); return; }
    if (name === ctx.me.name) { toast('Tên chưa đổi.'); return; }
    const button = f.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await saveMemberName(ctx.me.id, name);
      ctx.me.name = name;
      const self = ctx.team.members.find((m) => m.id === ctx.me.id);
      if (self) self.name = name;
      f.querySelector('[data-name]').textContent = name;
      f.querySelector('[data-initial]').textContent = initial(name);
      document.querySelector('#me .me-name')?.replaceChildren(name);
      document.querySelector('#me .av')?.replaceChildren(initial(name));
      toast('Đã đổi tên.');
    } catch (error) {
      console.error(error);
      toast(failure(error, 'Tên'));
    } finally {
      button.disabled = false;
    }
  };
}

function wire(ctx, f) {
  const account = ctx.team.accounts.find((a) => a.id === f.dataset.account);
  const area = f.elements.template;
  autoGrow(area);
  const refresh = () => {
    const code = f.elements.code.value.trim();
    const handle = cleanHandle(f.elements.handle.value);
    f.querySelector('[data-handle-warn]').hidden = !handle || HANDLE.test(handle);
    f.querySelector('[data-warn]').hidden = hasLinkSlot(area.value);
    f.querySelector('[data-preview]').innerHTML = isValidAccountCode(code)
      ? preview(area.value, code, HANDLE.test(handle) ? handle : account.handle)
      : '<span></span><p class="warn" style="margin:0">Mã chỉ gồm chữ thường a-z và số, 1 đến 20 ký tự.</p>';
    f.querySelector('[data-status]').textContent = '';
  };
  f.oninput = refresh;
  f.elements.handle.addEventListener('change', () => { f.elements.handle.value = cleanHandle(f.elements.handle.value); refresh(); });
  refresh();
  f.querySelector('[data-insert]').onclick = () => {
    const at = area.selectionStart ?? area.value.length;
    area.setRangeText('{link}', at, area.selectionEnd ?? at, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const handle = cleanHandle(f.elements.handle.value);
    const code = f.elements.code.value.trim();
    if (!HANDLE.test(handle)) { toast('Tên tài khoản chưa đúng dạng.'); return; }
    if (!isValidAccountCode(code)) { toast('Mã tài khoản chưa đúng.'); return; }
    if (ctx.team.accounts.some((a) => a.handle === handle && a.id !== account.id)) { toast('Tên tài khoản này đã có người dùng.'); return; }
    if (ctx.team.settings.some((s) => s.account_code === code && s.account_id !== account.id)) { toast('Mã này tài khoản khác đang dùng.'); return; }
    const current = settingsFor(ctx, account);
    const handleChanged = handle !== account.handle;
    const settingsChanged = area.value !== current.r2_template || code !== current.account_code;
    if (!handleChanged && !settingsChanged) { toast('Chưa có gì thay đổi.'); return; }
    const button = f.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (handleChanged) {
        await saveHandle(account.id, handle);
        account.handle = handle;
        f.elements.handle.value = handle;
        f.querySelector('[data-title]').textContent = `@${handle}`;
      }
      if (settingsChanged) await saveSettings({ account_id: account.id, r2_template: area.value, account_code: code });
      ctx.team.settings = (await loadTeam()).settings;
      toast('Đã lưu.');
      f.querySelector('[data-status]').textContent = settingsChanged ? 'Đã lưu. Bài chọn từ giờ dùng bản này.' : 'Đã lưu.';
    } catch (error) {
      console.error(error);
      toast(failure(error, 'Tên tài khoản'));
    } finally {
      button.disabled = false;
    }
  };
}

export async function renderSettings(main, ctx) {
  // Posting accounts first, then the creative one.
  const mine = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id).sort((a, b) => (a.kind === 'creative') - (b.kind === 'creative'));
  main.innerHTML = `<div class="page-head"><div><p class="eyebrow">Cài đặt</p><h1 class="page-title">Tài khoản của bạn</h1>
      <p class="sub">Tên của bạn, tên từng tài khoản Threads, bình luận 2 và mã link. Đặt {link} ở chỗ cần link tải app.</p></div></div>
    ${profile(ctx)}
    ${mine.map((a) => form(ctx, a)).join('') || '<div class="empty" style="margin-top:12px"><h2>Chưa có tài khoản</h2><p>Nhắn Nam để được thêm.</p></div>'}`;
  wireProfile(ctx, main.querySelector('#profile'));
  main.querySelectorAll('form[data-account]').forEach((f) => wire(ctx, f));
  main.querySelector('#out').onclick = () => signOut();
}
