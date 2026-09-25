const screens = {
  workout: { label: 'Trong lúc tập', alt: 'Vika đếm rep trong buổi tập lunge' },
  feedback: { label: 'Sau mỗi hiệp', alt: 'Vika tổng kết sau hiệp tập' },
  plan: { label: 'Lộ trình của bạn', alt: 'Buổi tập và các động tác trong ứng dụng Vika' },
};

document.querySelectorAll('[data-screen]').forEach(button => {
  button.addEventListener('click', () => {
    const screen = screens[button.dataset.screen];
    const image = document.querySelector('.demo-phone img');
    image.src = `assets/home/app-${button.dataset.screen}.png`;
    image.alt = screen.alt;
    document.querySelectorAll('[data-screen]').forEach(option => {
      option.setAttribute('aria-pressed', String(option === button));
    });
    document.getElementById('screen-caption').textContent = `${screen.label} · Ảnh từ ứng dụng Vika`;
  });
});

const menu = document.querySelector('.mobile-menu');
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { menu.open = false; }));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
document.addEventListener('click', event => {
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});

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
    button.textContent = 'Đăng ký trải nghiệm ↗';
  }
});
