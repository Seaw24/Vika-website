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
