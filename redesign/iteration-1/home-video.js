const heroVideo = document.getElementById('hero-video');
const videoToggle = document.getElementById('hero-video-toggle');
const previewDetails = document.getElementById('film');
const fullPreview = document.getElementById('full-preview');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let wantsPlayback = !motionPreference.matches && !navigator.connection?.saveData;
let heroVisible = false;
let heroFailed = false;

function loadVideo(video) {
  if (!video.getAttribute('src')) video.src = video.dataset.src;
}

function syncHeroPlayback() {
  if (wantsPlayback && heroVisible && !document.hidden && fullPreview.paused && !heroFailed) {
    loadVideo(heroVideo);
    heroVideo.play().catch(() => { videoToggle.textContent = 'Phát video'; });
  } else {
    heroVideo.pause();
  }
}

videoToggle.hidden = false;
videoToggle.addEventListener('click', () => {
  wantsPlayback = heroVideo.paused;
  syncHeroPlayback();
});
heroVideo.addEventListener('playing', () => {
  heroVideo.classList.add('is-playing');
  videoToggle.textContent = 'Tạm dừng video';
});
heroVideo.addEventListener('pause', () => { videoToggle.textContent = 'Phát video'; });
heroVideo.addEventListener('error', () => {
  heroFailed = true;
  heroVideo.classList.remove('is-playing');
  videoToggle.hidden = true;
});
motionPreference.addEventListener('change', () => {
  wantsPlayback = !motionPreference.matches && !navigator.connection?.saveData;
  syncHeroPlayback();
});
new IntersectionObserver(entries => {
  heroVisible = entries[0].isIntersecting;
  syncHeroPlayback();
}, { threshold: 0.15 }).observe(heroVideo);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) fullPreview.pause();
  syncHeroPlayback();
});

function playFullPreview() {
  loadVideo(fullPreview);
  fullPreview.play().catch(() => { /* Native controls remain available. */ });
}
document.querySelectorAll('[data-play-preview]').forEach(link => {
  link.addEventListener('click', () => {
    previewDetails.open = true;
    playFullPreview();
  });
});
previewDetails.addEventListener('toggle', () => {
  if (previewDetails.open) playFullPreview();
  else fullPreview.pause();
});
fullPreview.addEventListener('play', () => heroVideo.pause());
fullPreview.addEventListener('pause', syncHeroPlayback);
fullPreview.addEventListener('error', () => {
  document.querySelector('.film-note').textContent = 'Chưa tải được video. Vui lòng tải lại trang hoặc xem các màn hình ứng dụng phía trên.';
});
