import { signIn, signOut } from '../data.js';
import { esc } from '../ui.js';

const stage = (inner) => `<div class="gate-wrap"><section class="stage gate-stage">
  <div><img class="mark" src="img/wordmark-gold.png" width="486" height="164" alt="Vika">
    <p class="eyebrow">Vika studio</p>
    <h1>Bài của tuần,<br><span class="gold">sẵn để đăng.</span></h1>
    <p class="lede">Mỗi ngày một bài cho từng tài khoản. Sao chép, dán vào Threads, xong.</p></div>
  <div class="gate-form">${inner}</div></section></div>`;

export async function renderSignIn(main, ctx) {
  if (ctx?.email) {
    main.innerHTML = stage(`<h2 style="font-size:24px;letter-spacing:-.02em">Chưa có trong nhóm</h2>
      <p class="muted" style="margin-top:8px">Email ${esc(ctx.email)} chưa có trong nhóm. Nhắn Nam để được thêm.</p>
      <button class="btn btn-ghost wide" id="out" style="margin-top:20px">Đăng xuất</button>`);
    main.querySelector('#out').onclick = () => signOut();
    return;
  }
  main.innerHTML = stage(`<form id="signin">
      <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false"></label>
      <label class="field pw"><span>Mật khẩu</span><input type="password" name="password" required autocomplete="current-password" autocapitalize="none" spellcheck="false">
        <button type="button" id="show" aria-pressed="false">Hiện</button></label>
      <button class="btn btn-gold wide" type="submit">Đăng nhập</button>
    </form>
    <p class="gate-msg" id="msg" role="status"></p>`);
  const form = main.querySelector('#signin');
  const msg = main.querySelector('#msg');
  const show = main.querySelector('#show');
  show.onclick = () => {
    const on = form.elements.password.type === 'password';
    form.elements.password.type = on ? 'text' : 'password';
    show.textContent = on ? 'Ẩn' : 'Hiện';
    show.setAttribute('aria-pressed', String(on));
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    msg.textContent = 'Đang đăng nhập…';
    try {
      await signIn(String(data.get('email')).trim().toLowerCase(), String(data.get('password')).trim());
    } catch (error) {
      button.disabled = false;
      msg.textContent = error.code === 'invalid_credentials' || /invalid login/i.test(error.message ?? '')
        ? 'Sai email hoặc mật khẩu. Quên mật khẩu thì nhắn Nam.'
        : `Chưa đăng nhập được: ${error.message}`;
    }
  };
}
