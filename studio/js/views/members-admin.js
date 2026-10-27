// Cài đặt, for admins only: add a person to the team (Nam, 2026-10-21). The panel appears once the admin check
// answers, so the rest of the page never waits on it.
import { addMember, isAdmin } from '../data.js?v=20261026a';
import { checkMember, cleanEmail, cleanName, failText, addedText, inviteText } from '../lib/members.js';
import { esc, toast, icon, copyText } from '../ui.js?v=20261026a';

function panelHtml() {
  return `<section class="panel add-acct" id="add-member">
    <button type="button" class="add-open" data-open aria-expanded="false" aria-controls="member-form">
      <span class="plus" aria-hidden="true"></span>
      <span class="grow"><b>Thêm người vào nhóm</b><span class="small muted">Chỉ admin thấy mục này. Người mới đăng nhập bằng email và mật khẩu chung của nhóm.</span></span></button>
    <form id="member-form" hidden novalidate>
      <label class="field"><span>Email của người mới</span>
        <input name="email" type="email" inputmode="email" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="254" placeholder="ten@gmail.com"></label>
      <label class="field"><span>Tên trong nhóm</span>
        <input name="name" maxlength="60" autocomplete="off" placeholder="Ví dụ: Hòa"></label>
      <p class="tiny muted add-note">Người mới tự đổi tên trong Cài đặt, rồi thêm tài khoản Threads để nhận bài ngay.</p>
      <p class="warn" data-warn hidden></p>
      <div class="save"><button class="btn btn-ink" type="submit">Thêm người</button><button type="button" class="btn btn-line" data-cancel>Huỷ</button></div>
      <div class="add-done" data-done hidden><p class="small" data-result role="status"></p>
        <div class="save"><button type="button" class="btn btn-line sm" data-copy>${icon('copy')}Chép lời nhắn cho người mới</button></div></div>
    </form></section>`;
}

function wire(ctx, panel) {
  const f = panel.querySelector('form');
  const toggle = panel.querySelector('[data-open]');
  const warn = f.querySelector('[data-warn]');
  const done = f.querySelector('[data-done]');
  let invite = '';
  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    f.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) f.elements.email.focus();
  };
  const say = (text) => { warn.innerHTML = text ? `${icon('info')}${esc(text)}` : ''; warn.hidden = !text; };
  toggle.onclick = () => setOpen(f.hidden);
  f.querySelector('[data-cancel]').onclick = () => { f.reset(); say(''); done.hidden = true; setOpen(false); toggle.focus(); };
  f.querySelector('[data-copy]').onclick = async () => toast(await copyText(invite) ? 'Đã chép lời nhắn.' : 'Chưa chép được.');
  f.oninput = () => say('');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const email = cleanEmail(f.elements.email.value);
    const name = cleanName(f.elements.name.value);
    const problem = checkMember(email, name);
    if (problem) { say(problem); return; }
    const button = f.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const added = await addMember(email, name);
      // Nhóm shows the new person at once; the next visit reads the team fresh.
      if (!ctx.team.members.some((m) => m.id === added.member.id)) {
        ctx.team.members = [...ctx.team.members, added.member].sort((a, b) => a.name.localeCompare(b.name));
      }
      invite = inviteText(added);
      f.querySelector('[data-result]').textContent = addedText(added);
      done.hidden = false;
      f.elements.email.value = '';
      f.elements.name.value = '';
      toast(`Đã thêm ${added.member.name}.`);
    } catch (error) {
      console.error(error);
      say(failText(error.code));
    } finally {
      button.disabled = false;
    }
  };
}

// Adds the panel to the end of Cài đặt when the signed-in member is an admin.
export async function showMemberPanel(main, ctx) {
  const admin = await isAdmin().catch((error) => { console.error(error); return false; });
  // She may have left Cài đặt while the check ran.
  if (!admin || !main.querySelector('#profile') || main.querySelector('#add-member')) return;
  main.insertAdjacentHTML('beforeend', panelHtml());
  wire(ctx, main.querySelector('#add-member'));
}
