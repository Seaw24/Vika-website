import { saveSettings, saveMemberName, saveAvatar, removeAvatar, saveHandle, addAccount, setAccountActive, loadTeam, signOut } from '../data.js?v=20261104g';
import { squarePhoto } from '../lib/photo.js?v=20261104g';
import { addedToast } from '../lib/pool.js?v=20261104g';
import { hasLinkSlot, isValidAccountCode, appLink, buildCt } from '../lib/ct.js';
import { esc, toast, icon, initial, autoGrow, face, setFace } from '../ui.js?v=20261104g';
import { settingsFor, homeAccount, isActive, memberR2, freshCode, linkCode, postAccounts } from './shared.js';
import { showMemberPanel } from './members-admin.js';
import { showTargetsPanel } from './targets.js?v=20261104g';

// Cài đặt in four sections, each with its own heading (Nam, 2026-11-04: the page ran as one long column with nothing
// set apart): Hồ sơ, Tài khoản Threads (one row per account, its link code, edited in place), Bình luận 2 (one text for
// every seeding account, previewed with each account's link) and Quản lý (plans and new people, only for those who
// may). A side menu on a wide screen, a row of chips on a phone.

// Each active seeding account holds one card from the shared pool at a time (Nam, 2026-10-27; migration card_pool).
const KIND_LABEL = { card: 'Seeding', creative: 'Sáng tạo' };

const HANDLE = /^[a-z0-9._]{1,30}$/;
// Accepts "@name", "name" or a pasted profile link like threads.com/@name.
const cleanHandle = (v) => String(v).trim().replace(/^https?:\/\/(www\.)?threads\.(net|com)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase();

const failure = (error, what) => error?.code === '23505' ? `${what} này đã có người dùng.`
  : error?.code === '23514' ? `${what} chưa đúng dạng.` : 'Chưa lưu được. Thử lại nhé.';
const SAMPLE = 'giapt';
const codeOk = 'Chỉ chữ thường a-z và số, 1 đến 20 ký tự.';
const takenBy = (ctx, code, accountId) => ctx.team.settings.some((s) => s.account_code === code && s.account_id !== accountId)
  || ctx.team.accounts.some((a) => a.id !== accountId && !ctx.team.settings.some((s) => s.account_id === a.id) && linkCode(ctx, a) === code);

// The preview shows the reply as Threads will, with the link standing out where {link} sits.
function preview(template, code, who) {
  const link = appLink(buildCt(code, SAMPLE));
  const body = String(template).split('{link}').map(esc).join(`<span class="link">${esc(link)}</span>`);
  return `<i class="av sm">${esc(initial(who.replace(/^@/, '').split('.').at(-1)))}</i><div><b>${esc(who)}</b><p class="plain">${body || '<span class="muted">Trống</span>'}</p></div>`;
}

// The text of a Bình luận 2 with its {link} button and the missing-link warning.
const textHtml = (template, label) => `
    <div class="field"><div class="label-row"><span>${label}</span><button type="button" class="insert" data-insert>${icon('link')}Chèn {link}</button></div>
      <textarea name="template" aria-label="${esc(label)}" rows="3">${esc(template)}</textarea></div>
    <p class="warn" data-warn${hasLinkSlot(template) ? ' hidden' : ''}>${icon('info')}Chưa có {link}: bình luận 2 sẽ không có link tải app.</p>`;

const codeHtml = (code) => `
    <label class="field"><span>Mã link</span>
      <input name="code" value="${esc(code)}" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="20"></label>
    <p class="ac-example" data-example></p>`;

/* ---------- Sections ---------- */

const NAV = [['st-profile', 'Hồ sơ', 'user'], ['st-accounts', 'Tài khoản Threads', 'threads'], ['st-r2', 'Bình luận 2', 'reply'], ['st-admin', 'Quản lý', 'settings']];

function sectionHead(title, sub, aside = '') {
  return `<header class="st-sh"><div><h2>${title}</h2><p>${sub}</p></div>${aside}</header>`;
}

// Her photo (Nam, 2026-11-04): a tap on the avatar or on Thêm ảnh opens the phone's photos; Studio keeps the middle
// square (lib/photo.js). Xoá ảnh brings her initial back.
const photoActs = (me) => `<button type="button" class="pf-btn" data-photo-pick>${me.avatar_url ? 'Đổi ảnh' : 'Thêm ảnh'}</button>${me.avatar_url
  ? '<button type="button" class="pf-btn" data-photo-drop>Xoá ảnh</button>' : ''}`;

function profile(ctx) {
  return `<section class="st-sec" id="st-profile" aria-labelledby="st-profile-h">
    <header class="st-sh"><div><h2 id="st-profile-h">Hồ sơ</h2><p>Tên và ảnh của bạn hiện trong Kho bài, Bảng vàng và Góp ý.</p></div></header>
    <form class="st-card profile-form" id="profile">
      <div class="profile"><label class="pf-photo" title="Đổi ảnh đại diện"><span data-face>${face(ctx.me)}</span><span class="pf-cam" aria-hidden="true">${icon('camera')}</span>
          <input class="pf-file" type="file" accept="image/*" data-photo aria-label="Chọn ảnh đại diện"></label>
        <div class="grow"><b data-name>${esc(ctx.me.name)}</b><span class="small muted">${esc(ctx.me.email)}</span>
          <span class="pf-acts" data-photo-acts>${photoActs(ctx.me)}</span></div>
        <button type="button" class="btn btn-line sm out" id="out">Đăng xuất</button></div>
      <label class="field"><span>Tên của bạn trong nhóm</span>
        <span class="inline-save"><input name="name" value="${esc(ctx.me.name)}" maxlength="60" autocomplete="name">
        <button class="btn btn-ink" type="submit">Lưu</button></span></label></form></section>`;
}

// One row per account: its handle, kind and link code; Sửa opens the editor under the row.
function accountRow(ctx, account) {
  const card = account.kind === 'card';
  const code = linkCode(ctx, account);
  return `<li class="ac-row" data-row="${esc(account.id)}">
    <div class="ac-main"><i class="ac-av ${card ? '' : 'cre'}" aria-hidden="true">${esc(initial(account.handle.split('.').at(0)))}</i>
      <span class="ac-id"><b data-title>@${esc(account.handle)}</b>
        <small><span class="ac-kind ${card ? 'seed' : 'cre'}">${KIND_LABEL[account.kind]}</span><span class="ac-code">Mã link <code data-code>${esc(code)}</code></span></small></span>
      <button type="button" class="btn btn-line sm" data-open-row aria-expanded="false" aria-controls="ac-${esc(account.id)}">Sửa</button></div>
    <form class="ac-edit" id="ac-${esc(account.id)}" data-account="${esc(account.id)}" hidden novalidate>
      <label class="field"><span>Tên tài khoản Threads</span>
        <span class="at-input"><i>@</i><input name="handle" value="${esc(account.handle)}" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="80" placeholder="ten.tai.khoan"></span></label>
      <p class="warn" data-handle-warn hidden>${icon('info')}Chỉ chữ thường, số, dấu chấm và gạch dưới, tối đa 30 ký tự.</p>
      ${card ? codeHtml(code) : `${textHtml(settingsFor(ctx, account).r2_template, 'Bình luận 2 của tài khoản này')}${codeHtml(code)}
        <div><p class="eyebrow" style="margin:16px 0 0">Xem trước</p><div class="bubble" data-preview></div></div>`}
      <div class="ac-acts"><button class="btn btn-ink sm" type="submit">Lưu</button><button type="button" class="btn btn-line sm" data-close-row>Huỷ</button>
        <span class="tiny muted" data-status></span><button type="button" class="retire-btn" data-retire>Ngừng dùng</button></div>
      <div class="retire-box" data-retire-box hidden>
        <p><b>Ngừng dùng @${esc(account.handle)}?</b> Bài đã đăng và số liệu vẫn giữ nguyên. Từ lần đọc Threads tiếp theo, hệ thống thôi tìm bài mới trên tài khoản này${card ? ', và Hôm nay của bạn nhận ít hơn một bài từ kho chung' : ''}. Muốn dùng lại lúc nào cũng được.</p>
        <div class="actions"><button type="button" class="btn btn-ink sm" data-retire-yes>Ngừng dùng</button><button type="button" class="btn btn-line sm" data-retire-no>Thôi</button></div>
      </div></form></li>`;
}

function addRow(ctx, open) {
  const seeding = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id && a.kind === 'card' && isActive(a)).length;
  return `<li class="ac-add${open ? ' open' : ''}" id="add">
    <button type="button" class="add-open" data-open aria-expanded="${open}" aria-controls="add-form">
      <span class="plus" aria-hidden="true"></span>
      <span class="grow"><b>Thêm tài khoản Threads</b><span class="small muted">Mỗi tài khoản seeding thêm một bài vào số bài bạn đăng mỗi ngày.</span></span></button>
    <form id="add-form" data-add-form${open ? '' : ' hidden'} novalidate>
      <label class="field"><span>Tên tài khoản Threads</span>
        <span class="at-input"><i>@</i><input name="handle" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="80" placeholder="ten.tai.khoan"></span></label>
      <p class="warn" data-handle-warn hidden>${icon('info')}Chỉ chữ thường, số, dấu chấm và gạch dưới, tối đa 30 ký tự.</p>
      <fieldset class="kind-pick"><legend>Tài khoản này có seeding không?</legend>
        <label class="kind-opt"><input type="radio" name="kind" value="card" checked>
          <span><b>Có, seeding</b><span>Đăng bài có sẵn của nhóm, kèm Bình luận 2 có link tải app. Mỗi ngày đăng thêm một bài.</span></span></label>
        <label class="kind-opt"><input type="radio" name="kind" value="creative">
          <span><b>Không, sáng tạo</b><span>Bạn tự viết bài. Số bài đăng mỗi ngày giữ nguyên.</span></span></label>
      </fieldset>
      <p class="tiny muted add-note" data-note data-seeding="${seeding}"></p>
      <div class="ac-acts"><button class="btn btn-ink" type="submit">Thêm tài khoản</button><button type="button" class="btn btn-line" data-cancel>Huỷ</button></div>
    </form></li>`;
}

function retiredList(retired) {
  if (!retired.length) return '';
  return `<details class="ac-retired"><summary><span>Đã ngừng dùng · ${retired.length}</span><span class="plus" aria-hidden="true"></span></summary>
    <ul>${retired.map((a) => `<li><span class="grow"><b>@${esc(a.handle)}</b><span class="ac-kind ${a.kind === 'card' ? 'seed' : 'cre'}">${KIND_LABEL[a.kind]}</span></span>
      <button type="button" class="btn btn-line sm" data-revive="${esc(a.id)}">Dùng lại</button></li>`).join('')}</ul></details>`;
}

function accountsSection(ctx, live, retired) {
  return `<section class="st-sec" id="st-accounts" aria-labelledby="st-accounts-h">
    <header class="st-sh"><div><h2 id="st-accounts-h">Tài khoản Threads</h2><p>Mỗi tài khoản có một mã link riêng, mặc định là tên tài khoản. Mã nằm ở đầu link tải app trong bình luận 2, để biết lượt cài đến từ tài khoản nào.</p></div></header>
    <div class="st-card ac-card"><ul class="ac-list">${live.map((a) => accountRow(ctx, a)).join('')}${addRow(ctx, !live.length)}</ul>${retiredList(retired)}</div></section>`;
}

// Her one Bình luận 2 text for every seeding account; the preview shows it with the link of the account picked there.
function r2Section(ctx) {
  const r2 = memberR2(ctx, ctx.me.id);
  if (!r2) return '';
  const list = postAccounts(ctx, ctx.me.id);
  const pick = list.length > 1 ? `<div class="acct-pick" role="radiogroup" aria-label="Xem link của tài khoản"><span class="acct-pick-l">Link của</span>
    ${list.map((a, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-preview-acct="${esc(a.id)}">@${esc(a.handle)}</button>`).join('')}</div>` : '';
  return `<section class="st-sec" id="st-r2" aria-labelledby="st-r2-h">
    <header class="st-sh"><div><h2 id="st-r2-h">Bình luận 2</h2><p>Một bình luận cho mọi tài khoản seeding. Đặt {link} ở chỗ cần link tải app; link tự mang mã của tài khoản bạn đăng bài.</p></div></header>
    <form class="st-card r2-form" id="r2">
      ${textHtml(r2.r2_template, 'Bình luận 2 của bạn')}
      <div class="r2-preview"><div class="r2-preview-h"><p class="eyebrow">Xem trước</p>${pick}</div><div class="bubble" data-preview></div></div>
      <div class="ac-acts"><button class="btn btn-ink" type="submit">Lưu</button><span class="tiny muted" data-status></span></div></form></section>`;
}

function adminSection() {
  return `<section class="st-sec st-admin-sec" id="st-admin" aria-labelledby="st-admin-h">
    ${sectionHead('<span id="st-admin-h">Quản lý</span>', 'Chỉ quản lý và admin thấy mục này.')}
    <div class="st-admin"><div data-slot="targets"></div><div data-slot="members"></div></div></section>`;
}

/* ---------- Wiring ---------- */

// Adding, retiring or reviving an account can change which seeding account is first. The new first one takes over the
// Bình luận 2 text she uses now, with its own link code, so the text never changes under her.
async function keepHome(ctx, memberId, change) {
  const before = memberR2(ctx, memberId);
  await change();
  const after = homeAccount(ctx, memberId);
  if (!after || !before?.created_at || after.id === before.account.id) return;
  if (settingsFor(ctx, after).r2_template === before.r2_template) return;
  await saveSettings({ account_id: after.id, r2_template: before.r2_template, account_code: linkCode(ctx, after) });
  ctx.team.settings = (await loadTeam()).settings;
}

function wireRetire(ctx, f, account, main) {
  const box = f.querySelector('[data-retire-box]');
  const open = f.querySelector('[data-retire]');
  open.onclick = () => { box.hidden = false; open.hidden = true; box.querySelector('[data-retire-no]').focus(); };
  box.querySelector('[data-retire-no]').onclick = () => { box.hidden = true; open.hidden = false; open.focus(); };
  box.querySelector('[data-retire-yes]').onclick = async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      await keepHome(ctx, account.member_id, async () => {
        await setAccountActive(account.id, false);
        account.active = false;
      });
      toast(`Đã ngừng dùng @${account.handle}.`);
      await renderSettings(main, ctx, '#st-accounts');
    } catch (error) {
      console.error(error);
      toast('Chưa ngừng được. Thử lại nhé.');
      button.disabled = false;
    }
  };
}

function wireAdd(ctx, panel, main) {
  const f = panel.querySelector('[data-add-form]');
  const toggle = panel.querySelector('[data-open]');
  const note = f.querySelector('[data-note]');
  const seeding = Number(note.dataset.seeding);
  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    f.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) f.elements.handle.focus();
  };
  const refresh = () => {
    const handle = cleanHandle(f.elements.handle.value);
    f.querySelector('[data-handle-warn]').hidden = !handle || HANDLE.test(handle);
    const card = f.elements.kind.value === 'card';
    note.textContent = card
      ? `Dùng chung Bình luận 2 của bạn, với mã link là tên tài khoản. Mỗi ngày bạn đăng ${seeding + 1} bài thay vì ${seeding}, chọn trong Kho bài. Sáng mai hệ thống bắt đầu đọc số liệu của tài khoản này.`
      : 'Sáng mai hệ thống bắt đầu đọc số liệu của tài khoản này.';
  };
  toggle.onclick = () => setOpen(f.hidden);
  f.querySelector('[data-cancel]').onclick = () => { f.reset(); refresh(); setOpen(false); toggle.focus(); };
  f.oninput = refresh;
  f.elements.handle.addEventListener('change', () => { f.elements.handle.value = cleanHandle(f.elements.handle.value); refresh(); });
  refresh();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const handle = cleanHandle(f.elements.handle.value);
    const kind = f.elements.kind.value;
    if (!handle) { toast('Nhập tên tài khoản Threads.'); f.elements.handle.focus(); return; }
    if (!HANDLE.test(handle)) { toast('Tên tài khoản chưa đúng dạng.'); f.elements.handle.focus(); return; }
    if (ctx.team.accounts.some((a) => a.handle === handle)) { toast('Tên tài khoản này đã có trong nhóm.'); f.elements.handle.focus(); return; }
    const button = f.querySelector('[type=submit]');
    button.disabled = true;
    button.textContent = 'Đang thêm…';
    try {
      let account;
      await keepHome(ctx, ctx.me.id, async () => {
        account = await addAccount({ member_id: ctx.me.id, handle, kind });
        ctx.team.accounts.push(account);
      });
      // A new creative account starts from her creative text. A seeding account needs no row: its code is its handle
      // and its text is hers.
      const source = kind === 'creative'
        ? ctx.team.accounts.find((a) => a.member_id === ctx.me.id && a.kind === 'creative' && a.id !== account.id && isActive(a)) ?? homeAccount(ctx, ctx.me.id)
        : null;
      if (source) {
        await saveSettings({ account_id: account.id, r2_template: settingsFor(ctx, source).r2_template, account_code: freshCode(ctx, handle, [account.id]) });
        ctx.team.settings = (await loadTeam()).settings;
      }
      toast(addedToast(handle, kind));
      await renderSettings(main, ctx);
      const added = main.querySelector(`[data-row="${CSS.escape(account.id)}"]`);
      added?.classList.add('fresh');
      added?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      console.error(error);
      toast(failure(error, 'Tên tài khoản'));
      button.disabled = false;
      button.textContent = 'Thêm tài khoản';
    }
  };
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
      document.querySelector('#me .me-name')?.replaceChildren(name);
      paintFace(ctx, f);
      toast('Đã đổi tên.');
    } catch (error) {
      console.error(error);
      toast(failure(error, 'Tên'));
    } finally {
      button.disabled = false;
    }
  };
  wirePhoto(ctx, f);
}

// Her avatar here and in the header, after a new name or a new photo.
function paintFace(ctx, f) {
  f.querySelector('[data-face]').innerHTML = face(ctx.me);
  f.querySelector('[data-photo-acts]').innerHTML = photoActs(ctx.me);
  const head = document.querySelector('#me .av');
  if (head) head.outerHTML = face(ctx.me);
}

function setPhoto(ctx, f, { avatar_path, avatar_url }) {
  for (const m of new Set([ctx.me, ctx.team.members.find((x) => x.id === ctx.me.id)].filter(Boolean))) Object.assign(m, { avatar_path, avatar_url });
  setFace(ctx.me.id, avatar_url);
  paintFace(ctx, f);
}

function wirePhoto(ctx, f) {
  const input = f.querySelector('[data-photo]');
  const box = f.querySelector('.profile');
  let busy = false;
  const run = async (work, done, fail) => {
    if (busy) return;
    busy = true;
    box.classList.add('is-busy');
    try {
      setPhoto(ctx, f, await work());
      toast(done);
    } catch (error) {
      console.error(error);
      toast(fail(error));
    } finally {
      busy = false;
      box.classList.remove('is-busy');
    }
  };
  input.onchange = () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    run(async () => {
      let blob;
      try { blob = await squarePhoto(file); } catch { throw Object.assign(new Error('unreadable'), { unreadable: true }); }
      return saveAvatar(ctx.me.id, blob, ctx.me.avatar_path);
    }, 'Đã đổi ảnh đại diện.', (error) => error.unreadable ? 'Ảnh này chưa mở được. Chọn ảnh khác nhé.' : 'Chưa lưu được ảnh. Thử lại nhé.');
  };
  f.querySelector('[data-photo-acts]').onclick = (e) => {
    if (e.target.closest('[data-photo-pick]')) input.click();
    else if (e.target.closest('[data-photo-drop]')) {
      run(async () => {
        await removeAvatar(ctx.me.id, ctx.me.avatar_path);
        return { avatar_path: null, avatar_url: null };
      }, 'Đã xoá ảnh đại diện.', () => 'Chưa xoá được ảnh. Thử lại nhé.');
    }
  };
}

// The {link} button and the missing-link warning of a text box.
function wireText(f) {
  const area = f.elements.template;
  autoGrow(area);
  f.querySelector('[data-insert]').onclick = () => {
    const at = area.selectionStart ?? area.value.length;
    area.setRangeText('{link}', at, area.selectionEnd ?? at, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return () => { f.querySelector('[data-warn]').hidden = hasLinkSlot(area.value); };
}

// One account row: Sửa opens its editor, Huỷ closes it and puts the values back.
function wireRow(ctx, row, main) {
  const f = row.querySelector('form');
  const account = ctx.team.accounts.find((a) => a.id === f.dataset.account);
  const toggle = row.querySelector('[data-open-row]');
  const setOpen = (open) => {
    row.classList.toggle('open', open);
    f.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.hidden = open;
    if (open) f.elements.handle.focus();
  };
  toggle.onclick = () => setOpen(true);
  row.querySelector('[data-close-row]').onclick = () => { f.reset(); refresh(); setOpen(false); toggle.focus(); };
  wireRetire(ctx, f, account, main);
  const area = f.elements.template;
  const text = area ? wireText(f) : () => {};
  const who = () => `@${HANDLE.test(cleanHandle(f.elements.handle.value)) ? cleanHandle(f.elements.handle.value) : account.handle}`;
  const refresh = () => {
    const handle = cleanHandle(f.elements.handle.value);
    const code = f.elements.code.value.trim();
    f.querySelector('[data-handle-warn]').hidden = !handle || HANDLE.test(handle);
    text();
    f.querySelector('[data-example]').innerHTML = isValidAccountCode(code)
      ? `Link: …&amp;ct=<b>${esc(code)}</b>_${SAMPLE}` : `<span class="warn-text">${codeOk}</span>`;
    const box = f.querySelector('[data-preview]');
    if (box) box.innerHTML = isValidAccountCode(code) ? preview(area.value, code, who()) : '';
    f.querySelector('[data-status]').textContent = '';
  };
  f.oninput = refresh;
  f.elements.handle.addEventListener('change', () => { f.elements.handle.value = cleanHandle(f.elements.handle.value); refresh(); });
  refresh();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const handle = cleanHandle(f.elements.handle.value);
    const code = f.elements.code.value.trim();
    if (!HANDLE.test(handle)) { toast('Tên tài khoản chưa đúng dạng.'); return; }
    if (!isValidAccountCode(code)) { toast('Mã link chưa đúng.'); return; }
    if (ctx.team.accounts.some((a) => a.handle === handle && a.id !== account.id)) { toast('Tên tài khoản này đã có người dùng.'); return; }
    if (takenBy(ctx, code, account.id)) { toast('Mã này tài khoản khác đang dùng.'); return; }
    const current = settingsFor(ctx, account);
    // A seeding account's row keeps her text, so the row never holds an old one.
    const template = area ? area.value : memberR2(ctx, account.member_id)?.r2_template ?? current.r2_template;
    const handleChanged = handle !== account.handle;
    const settingsChanged = code !== current.account_code || (area && area.value !== current.r2_template);
    if (!handleChanged && !settingsChanged) { toast('Chưa có gì thay đổi.'); return; }
    const button = f.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (handleChanged) {
        await saveHandle(account.id, handle);
        account.handle = handle;
        row.querySelector('[data-title]').textContent = `@${handle}`;
      }
      if (settingsChanged) await saveSettings({ account_id: account.id, r2_template: template, account_code: code });
      ctx.team.settings = (await loadTeam()).settings;
      row.querySelector('[data-code]').textContent = linkCode(ctx, account);
      toast('Đã lưu.');
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast(failure(error, handleChanged ? 'Tên tài khoản' : 'Mã link'));
    } finally {
      button.disabled = false;
    }
  };
}

// Her Bình luận 2 text, saved on her first seeding account with that account's own code.
function wireR2(ctx, f) {
  const text = wireText(f);
  const list = postAccounts(ctx, ctx.me.id);
  let shown = list[0] ?? memberR2(ctx, ctx.me.id).account;
  const refresh = () => {
    text();
    f.querySelector('[data-preview]').innerHTML = preview(f.elements.template.value, linkCode(ctx, shown), `@${shown.handle}`);
  };
  f.querySelectorAll('[data-preview-acct]').forEach((b) => {
    b.onclick = () => {
      shown = list.find((a) => a.id === b.dataset.previewAcct) ?? shown;
      f.querySelectorAll('[data-preview-acct]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      refresh();
    };
  });
  f.oninput = () => { refresh(); f.querySelector('[data-status]').textContent = ''; };
  refresh();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const r2 = memberR2(ctx, ctx.me.id);
    const template = f.elements.template.value;
    if (r2.created_at && template === r2.r2_template) { toast('Chưa có gì thay đổi.'); return; }
    const button = f.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await saveSettings({ account_id: r2.account.id, r2_template: template, account_code: r2.account_code });
      ctx.team.settings = (await loadTeam()).settings;
      toast('Đã lưu.');
      f.querySelector('[data-status]').textContent = 'Đã lưu. Bài chọn từ giờ dùng bản này.';
    } catch (error) {
      console.error(error);
      toast(failure(error, 'Bình luận 2'));
    } finally {
      button.disabled = false;
    }
  };
}

// The menu scrolls to a section and follows the one in view.
function wireNav(main) {
  const buttons = [...main.querySelectorAll('[data-go-sec]')];
  buttons.forEach((b) => {
    b.onclick = () => main.querySelector(`#${b.dataset.goSec}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  const mark = (id) => buttons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.goSec === id)));
  mark('st-profile');
  const seen = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) seen.set(e.target.id, e.isIntersecting);
    const first = NAV.map(([id]) => id).find((id) => seen.get(id));
    if (first) mark(first);
  }, { rootMargin: '-120px 0px -55% 0px' });
  main.querySelectorAll('.st-sec').forEach((s) => io.observe(s));
}

export async function renderSettings(main, ctx, at = null) {
  // Seeding accounts first, oldest first, then the creative ones; retired ones fold away at the end.
  const order = (a, b) => (a.kind === 'creative') - (b.kind === 'creative')
    || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.handle.localeCompare(b.handle);
  const all = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id).sort(order);
  const live = all.filter(isActive);
  main.innerHTML = `<div class="st">
    <div class="page-head st-head"><div><p class="eyebrow">Cài đặt</p><h1 class="page-title">Tài khoản của bạn</h1></div></div>
    <div class="st-layout">
      <nav class="st-nav" aria-label="Các mục cài đặt">${NAV.map(([id, label, ic]) => `<button type="button" data-go-sec="${id}"${id === 'st-admin' ? ' data-admin-nav' : ''}>${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
      <div class="st-body">${profile(ctx)}${accountsSection(ctx, live, all.filter((a) => !isActive(a)))}${r2Section(ctx)}${adminSection()}</div>
    </div></div>`;
  wireProfile(ctx, main.querySelector('#profile'));
  const r2 = main.querySelector('#r2');
  if (r2) wireR2(ctx, r2);
  main.querySelectorAll('.ac-row').forEach((row) => wireRow(ctx, row, main));
  wireAdd(ctx, main.querySelector('#add'), main);
  main.querySelectorAll('[data-revive]').forEach((b) => {
    b.onclick = async () => {
      const account = ctx.team.accounts.find((a) => a.id === b.dataset.revive);
      b.disabled = true;
      try {
        await keepHome(ctx, account.member_id, async () => {
          await setAccountActive(account.id, true);
          account.active = true;
        });
        toast(`Đã dùng lại @${account.handle}.`);
        await renderSettings(main, ctx, '#st-accounts');
      } catch (error) {
        console.error(error);
        toast('Chưa dùng lại được. Thử lại nhé.');
        b.disabled = false;
      }
    };
  });
  main.querySelector('#out').onclick = () => signOut();
  wireNav(main);
  if (at) main.querySelector(at)?.scrollIntoView({ block: 'start' });
  showTargetsPanel(main.querySelector('[data-slot="targets"]'), ctx);
  showMemberPanel(main.querySelector('[data-slot="members"]'), ctx);
}
