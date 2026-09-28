import { saveSettings, saveMemberName, saveHandle, addAccount, setAccountActive, loadTeam, signOut } from '../data.js';
import { hasLinkSlot, isValidAccountCode, appLink, buildCt } from '../lib/ct.js';
import { esc, toast, icon, initial, autoGrow } from '../ui.js';
import { settingsFor, homeAccount, isActive, memberR2, freshCode } from './shared.js';

// Each active seeding account brings 7 cards a week (Nam, 2026-09-27).
const CARDS_PER_ACCOUNT = 7;
const KIND_LABEL = { card: 'Seeding', creative: 'Sáng tạo' };

const HANDLE = /^[a-z0-9._]{1,30}$/;
// Accepts "@name", "name" or a pasted profile link like threads.com/@name.
const cleanHandle = (v) => String(v).trim().replace(/^https?:\/\/(www\.)?threads\.(net|com)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase();

const failure = (error, what) => error?.code === '23505' ? `${what} này đã có người dùng.`
  : error?.code === '23514' ? `${what} chưa đúng dạng.` : 'Chưa lưu được. Thử lại nhé.';

// The preview shows the reply as Threads will, with the link standing out where {link} sits.
function preview(template, code, who) {
  const link = appLink(buildCt(code, 'giapt'));
  const body = String(template).split('{link}').map(esc).join(`<span class="link">${esc(link)}</span>`);
  return `<i class="av sm">${esc(initial(who.replace(/^@/, '').split('.').at(-1)))}</i><div><b>${esc(who)}</b><p class="plain">${body || '<span class="muted">Trống</span>'}</p></div>`;
}

// The Bình luận 2 text, its link code and a preview. Her seeding accounts share one; a creative account has its own.
const editorHtml = (s, textLabel, codeLabel) => `
    <div class="field"><div class="label-row"><span>${textLabel}</span><button type="button" class="insert" data-insert>${icon('link')}Chèn {link}</button></div>
      <textarea name="template" aria-label="${esc(textLabel)}" rows="3">${esc(s.r2_template)}</textarea></div>
    <p class="warn" data-warn${hasLinkSlot(s.r2_template) ? ' hidden' : ''}>${icon('info')}Chưa có {link}: bình luận 2 sẽ không có link tải app.</p>
    <label class="field"><span>${codeLabel} · chữ thường và số, tối đa 20 ký tự</span>
      <input name="code" value="${esc(s.account_code)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
    <div><p class="eyebrow" style="margin:18px 0 0">Xem trước</p><div class="bubble" data-preview></div></div>`;

// Her one Bình luận 2 and link code, for every seeding account (Nam, 2026-09-27).
function r2Panel(ctx) {
  const r2 = memberR2(ctx, ctx.me.id);
  if (!r2) return '';
  return `<form class="panel acct-form" id="r2">
    <div class="top-row"><h2>Bình luận 2 của bạn</h2><span class="tag">Mọi tài khoản seeding</span></div>
    <p class="tiny muted" style="margin-top:10px">Một bình luận 2 và một mã link cho mọi tài khoản seeding. Đăng bài trên tài khoản nào cũng được.</p>
    ${editorHtml(r2, 'Bình luận 2', 'Mã link của bạn')}
    <div class="save"><button class="btn btn-ink" type="submit">Lưu</button><span class="tiny muted" data-status></span></div></form>`;
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
  // A seeding account keeps only its handle here; her Bình luận 2 and link code sit in their own panel.
  const card = account.kind === 'card';
  return `<form class="panel acct-form" data-account="${esc(account.id)}">
    <div class="top-row"><h2 data-title>@${esc(account.handle)}</h2><span class="tag ${account.kind === 'card' ? '' : 'gold'}">${KIND_LABEL[account.kind]}</span></div>
    <label class="field"><span>Tên tài khoản Threads</span>
      <span class="at-input"><i>@</i><input name="handle" value="${esc(account.handle)}" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="80" placeholder="ten.tai.khoan"></span></label>
    <p class="warn" data-handle-warn hidden>${icon('info')}Chỉ chữ thường, số, dấu chấm và gạch dưới, tối đa 30 ký tự.</p>
    ${card ? '<p class="tiny muted" style="margin-top:10px">Dùng Bình luận 2 và mã link của bạn ở trên.</p>'
      : editorHtml(settingsFor(ctx, account), 'Bình luận 2 của tài khoản này', 'Mã tài khoản trong link')}
    <div class="save"><button class="btn btn-ink" type="submit">Lưu</button><span class="tiny muted" data-status></span>
      <button type="button" class="retire-btn" data-retire>Ngừng dùng</button></div>
    <div class="retire-box" data-retire-box hidden>
      <p><b>Ngừng dùng @${esc(account.handle)}?</b> Bài đã đăng và số liệu vẫn giữ nguyên. Từ sáng mai hệ thống thôi tìm bài mới trên tài khoản này${account.kind === 'card' ? `, và từ tuần sau bạn nhận ít hơn ${CARDS_PER_ACCOUNT} bài` : ''}. Muốn dùng lại lúc nào cũng được.</p>
      <div class="actions"><button type="button" class="btn btn-ink sm" data-retire-yes>Ngừng dùng</button><button type="button" class="btn btn-line sm" data-retire-no>Thôi</button></div>
    </div></form>`;
}

function addPanel(ctx, open) {
  const seeding = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id && a.kind === 'card' && isActive(a)).length;
  return `<section class="panel add-acct${open ? ' open' : ''}" id="add">
    <button type="button" class="add-open" data-open aria-expanded="${open}" aria-controls="add-form">
      <span class="plus" aria-hidden="true"></span>
      <span class="grow"><b>Thêm tài khoản Threads</b><span class="small muted">Mỗi tài khoản seeding nhận thêm ${CARDS_PER_ACCOUNT} bài mỗi tuần.</span></span></button>
    <form id="add-form" data-add-form${open ? '' : ' hidden'} novalidate>
      <label class="field"><span>Tên tài khoản Threads</span>
        <span class="at-input"><i>@</i><input name="handle" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="80" placeholder="ten.tai.khoan"></span></label>
      <p class="warn" data-handle-warn hidden>${icon('info')}Chỉ chữ thường, số, dấu chấm và gạch dưới, tối đa 30 ký tự.</p>
      <fieldset class="kind-pick"><legend>Tài khoản này có seeding không?</legend>
        <label class="kind-opt"><input type="radio" name="kind" value="card" checked>
          <span><b>Có, seeding</b><span>Đăng bài có sẵn của nhóm, kèm Bình luận 2 có link tải app. Nhận thêm ${CARDS_PER_ACCOUNT} bài mỗi tuần.</span></span></label>
        <label class="kind-opt"><input type="radio" name="kind" value="creative">
          <span><b>Không, sáng tạo</b><span>Bạn tự viết bài. Số bài nhận mỗi tuần giữ nguyên.</span></span></label>
      </fieldset>
      <p class="tiny muted add-note" data-note data-seeding="${seeding}"></p>
      <div class="save"><button class="btn btn-ink" type="submit">Thêm tài khoản</button><button type="button" class="btn btn-line" data-cancel>Huỷ</button></div>
    </form></section>`;
}

function retiredList(retired) {
  if (!retired.length) return '';
  return `<details class="fold retired"><summary><span>Đã ngừng dùng · ${retired.length}</span><span class="plus" aria-hidden="true"></span></summary>
    <div class="fold-body"><ul>${retired.map((a) => `<li><span class="grow"><b>@${esc(a.handle)}</b><span class="tag line">${KIND_LABEL[a.kind]}</span></span>
      <button type="button" class="btn btn-line sm" data-revive="${esc(a.id)}">Dùng lại</button></li>`).join('')}</ul></div></details>`;
}

// Adding, retiring or reviving an account can change which seeding account is first. The new first one
// takes over the Bình luận 2 and link code she uses now, so neither changes under her.
async function keepHome(ctx, memberId, change) {
  const before = memberR2(ctx, memberId);
  await change();
  const after = homeAccount(ctx, memberId);
  if (!after || !before?.created_at || after.id === before.account.id) return;
  const row = settingsFor(ctx, after);
  if (row.r2_template === before.r2_template && row.account_code === before.account_code) return;
  await saveSettings({ account_id: after.id, r2_template: before.r2_template, account_code: before.account_code });
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
      await renderSettings(main, ctx);
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
  const home = homeAccount(ctx, ctx.me.id);
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
      ? `${home && isActive(home) ? 'Dùng chung Bình luận 2 và mã link của bạn. ' : ''}Từ tuần sau bạn nhận ${(seeding + 1) * CARDS_PER_ACCOUNT} bài mỗi tuần thay vì ${seeding * CARDS_PER_ACCOUNT}. Sáng mai hệ thống bắt đầu đọc số liệu của tài khoản này.`
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
      // A new creative account starts from her creative text. A seeding account needs no row of its own:
      // it shares the first seeding account's, or shows the empty form when it is her first.
      const source = kind === 'creative'
        ? ctx.team.accounts.find((a) => a.member_id === ctx.me.id && a.kind === 'creative' && a.id !== account.id && isActive(a)) ?? home
        : null;
      if (source) {
        await saveSettings({ account_id: account.id, r2_template: settingsFor(ctx, source).r2_template, account_code: freshCode(ctx, handle) });
        ctx.team.settings = (await loadTeam()).settings;
      }
      toast(`Đã thêm @${handle}.`);
      await renderSettings(main, ctx);
      const added = main.querySelector(`form[data-account="${CSS.escape(account.id)}"]`);
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

function wire(ctx, f, main) {
  const account = ctx.team.accounts.find((a) => a.id === f.dataset.account);
  wireRetire(ctx, f, account, main);
  const area = f.elements.template;
  const who = () => `@${HANDLE.test(cleanHandle(f.elements.handle.value)) ? cleanHandle(f.elements.handle.value) : account.handle}`;
  const editor = area ? wireEditor(f, who) : () => {};
  const refresh = () => {
    const handle = cleanHandle(f.elements.handle.value);
    f.querySelector('[data-handle-warn]').hidden = !handle || HANDLE.test(handle);
    editor();
    f.querySelector('[data-status]').textContent = '';
  };
  f.oninput = refresh;
  f.elements.handle.addEventListener('change', () => { f.elements.handle.value = cleanHandle(f.elements.handle.value); refresh(); });
  refresh();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const handle = cleanHandle(f.elements.handle.value);
    const code = area ? f.elements.code.value.trim() : null;
    if (!HANDLE.test(handle)) { toast('Tên tài khoản chưa đúng dạng.'); return; }
    if (area && !isValidAccountCode(code)) { toast('Mã tài khoản chưa đúng.'); return; }
    if (ctx.team.accounts.some((a) => a.handle === handle && a.id !== account.id)) { toast('Tên tài khoản này đã có người dùng.'); return; }
    if (area && ctx.team.settings.some((s) => s.account_code === code && s.account_id !== account.id)) { toast('Mã này tài khoản khác đang dùng.'); return; }
    const current = settingsFor(ctx, account);
    const handleChanged = handle !== account.handle;
    const settingsChanged = Boolean(area) && (area.value !== current.r2_template || code !== current.account_code);
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

// The {link} button, the missing-link warning and the live preview. Returns the preview's refresh.
function wireEditor(f, who) {
  const area = f.elements.template;
  autoGrow(area);
  f.querySelector('[data-insert]').onclick = () => {
    const at = area.selectionStart ?? area.value.length;
    area.setRangeText('{link}', at, area.selectionEnd ?? at, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return () => {
    const code = f.elements.code.value.trim();
    f.querySelector('[data-warn]').hidden = hasLinkSlot(area.value);
    f.querySelector('[data-preview]').innerHTML = isValidAccountCode(code)
      ? preview(area.value, code, who())
      : '<span></span><p class="warn" style="margin:0">Mã chỉ gồm chữ thường a-z và số, 1 đến 20 ký tự.</p>';
  };
}

// Saved on her first seeding account. Her other accounts may hold the same code from an earlier first one.
function wireR2(ctx, f) {
  const editor = wireEditor(f, () => ctx.me.name);
  f.oninput = () => { editor(); f.querySelector('[data-status]').textContent = ''; };
  f.oninput();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const r2 = memberR2(ctx, ctx.me.id);
    const template = f.elements.template.value;
    const code = f.elements.code.value.trim();
    const own = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id && a.kind === 'card').map((a) => a.id);
    if (!isValidAccountCode(code)) { toast('Mã link chưa đúng.'); return; }
    if (ctx.team.settings.some((s) => s.account_code === code && !own.includes(s.account_id))) { toast('Mã này người khác đang dùng.'); return; }
    if (r2.created_at && template === r2.r2_template && code === r2.account_code) { toast('Chưa có gì thay đổi.'); return; }
    const button = f.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await saveSettings({ account_id: r2.account.id, r2_template: template, account_code: code });
      ctx.team.settings = (await loadTeam()).settings;
      toast('Đã lưu.');
      f.querySelector('[data-status]').textContent = 'Đã lưu. Bài chọn từ giờ dùng bản này.';
    } catch (error) {
      console.error(error);
      toast(failure(error, 'Mã link'));
    } finally {
      button.disabled = false;
    }
  };
}

export async function renderSettings(main, ctx) {
  // Seeding accounts first, oldest first, then the creative ones; retired ones fold away at the end.
  const order = (a, b) => (a.kind === 'creative') - (b.kind === 'creative')
    || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.handle.localeCompare(b.handle);
  const all = ctx.team.accounts.filter((a) => a.member_id === ctx.me.id).sort(order);
  const mine = all.filter(isActive);
  main.innerHTML = `<div class="page-head"><div><p class="eyebrow">Cài đặt</p><h1 class="page-title">Tài khoản của bạn</h1>
      <p class="sub">Tên của bạn, bình luận 2 và mã link của bạn, rồi từng tài khoản Threads. Đặt {link} ở chỗ cần link tải app.</p></div></div>
    ${profile(ctx)}
    ${r2Panel(ctx)}
    ${mine.map((a) => form(ctx, a)).join('')}
    ${addPanel(ctx, !mine.length)}
    ${retiredList(all.filter((a) => !isActive(a)))}`;
  wireProfile(ctx, main.querySelector('#profile'));
  const r2 = main.querySelector('#r2');
  if (r2) wireR2(ctx, r2);
  main.querySelectorAll('form[data-account]').forEach((f) => wire(ctx, f, main));
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
        await renderSettings(main, ctx);
      } catch (error) {
        console.error(error);
        toast('Chưa dùng lại được. Thử lại nhé.');
        b.disabled = false;
      }
    };
  });
  main.querySelector('#out').onclick = () => signOut();
}
