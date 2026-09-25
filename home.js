const screens = {
  workout: { label: 'Trong lúc tập' },
  feedback: { label: 'Sau mỗi hiệp' },
  plan: { label: 'Lộ trình của bạn' },
};

function setScreen(name) {
  if (!screens[name]) return;
  document.querySelectorAll('[data-shot]').forEach(shot => {
    shot.classList.toggle('is-active', shot.dataset.shot === name);
    shot.setAttribute('aria-hidden', String(shot.dataset.shot !== name));
  });
  document.querySelectorAll('[data-insight]').forEach(insight => insight.classList.toggle('is-active', insight.dataset.insight === name));
  document.querySelectorAll('[data-screen]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.screen === name)));
  document.querySelectorAll('[data-chapter]').forEach(chapter => chapter.classList.toggle('is-active', chapter.dataset.chapter === name));
  document.querySelectorAll('[data-index]').forEach(link => {
    link.classList.toggle('is-active', link.dataset.index === name);
    if (link.dataset.index === name) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  });
  const caption = document.getElementById('screen-caption');
  if (caption) caption.textContent = `${screens[name].label} · Ảnh từ ứng dụng Vika`;
}

document.querySelectorAll('[data-screen]').forEach(button => {
  button.addEventListener('click', () => setScreen(button.dataset.screen));
});
// home-motion.js reports the chapter in view through this event.
document.addEventListener('vika:screen', event => setScreen(event.detail));

setScreen('workout');

const form = document.querySelector('.experience-form');
const phone = form.elements.phone;
phone.addEventListener('input', () => phone.setCustomValidity(''));
form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('form-status');
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  const data = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(data)) data[key] = data[key].trim();
  if (!data.name) {
    form.elements.name.focus();
    status.textContent = 'Vui lòng nhập họ và tên của bạn.';
    return;
  }
  let number = data.phone.replace(/[\s().-]/g, '');
  if (/^0\d{9}$/.test(number)) number = '+84' + number.slice(1);
  else if (/^84\d{9}$/.test(number)) number = '+' + number;
  if (!/^\+[1-9]\d{8,14}$/.test(number)) {
    phone.setCustomValidity('Nhập số điện thoại hợp lệ, ví dụ 0912345678 hoặc +84912345678.');
    phone.reportValidity();
    return;
  }
  data.phone = number;
  button.disabled = true;
  button.textContent = 'Đang gửi...';
  status.textContent = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    // Keep the existing signup endpoint and payload contract.
    // Its opaque response cannot confirm that the backend saved the request.
    await fetch('https://script.google.com/macros/s/AKfycbwnFA4HlzmH1irh6h99ygpOd9yUnlnsw6gi0s6bGBDQ6DCRYpVGwQjoyo4tnIzPK2um0Q/exec', {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data), signal: controller.signal,
    });
    status.textContent = 'Yêu cầu đã được gửi đi. Vika sẽ liên hệ sau khi nhận được thông tin. Nếu cần hỗ trợ, bạn có thể liên hệ qua trang Hỗ trợ.';
    form.reset();
  } catch {
    status.textContent = 'Chưa thể xác nhận yêu cầu đã được gửi. Vui lòng kiểm tra kết nối và thử lại hoặc liên hệ qua trang Hỗ trợ.';
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
    button.textContent = 'Đăng ký trải nghiệm';
  }
});
