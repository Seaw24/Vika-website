const heroVideo = document.getElementById('hero-video');
const videoToggle = document.getElementById('hero-video-toggle');
const fullPreview = document.getElementById('full-preview');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let wantsPlayback = !motionPreference.matches && !navigator.connection?.saveData;
let heroVisible = false;
let heroFailed = false;
let filmWantsPlayback = wantsPlayback;
let filmVisible = false;
let filmFailed = false;

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

function syncFilmPlayback() {
  if (filmWantsPlayback && filmVisible && !document.hidden && !filmFailed) {
    loadVideo(fullPreview);
    fullPreview.play().catch(syncFilm);
  } else {
    fullPreview.pause();
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
  filmWantsPlayback = wantsPlayback;
  syncFilmPlayback();
  syncHeroPlayback();
});
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    syncHeroPlayback();
  }, { threshold: 0.15 }).observe(heroVideo);
  new IntersectionObserver(entries => {
    filmVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.2;
    syncFilmPlayback();
  }, { threshold: [0, 0.2] }).observe(fullPreview);
} else {
  heroVisible = true;
  syncHeroPlayback();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) fullPreview.pause();
  else syncFilmPlayback();
  syncHeroPlayback();
});

// The session film loads when visible, or when a visitor chooses a chapter.
// The compact page control replaces the native toolbar when JavaScript is available.
fullPreview.controls = false;
function playFullPreview(seekTo) {
  filmWantsPlayback = true;
  loadVideo(fullPreview);
  if (typeof seekTo === 'number') {
    const seek = () => { fullPreview.currentTime = seekTo; };
    if (fullPreview.readyState >= 1) seek();
    else fullPreview.addEventListener('loadedmetadata', seek, { once: true });
  }
  fullPreview.play().catch(syncFilm);
}
document.querySelectorAll('[data-play-preview]').forEach(control => {
  control.addEventListener('click', () => {
    if (control.hasAttribute('data-film-toggle') && !fullPreview.paused) {
      filmWantsPlayback = false;
      fullPreview.pause();
    }
    else playFullPreview();
  });
});
document.querySelectorAll('[data-seek]').forEach(button => {
  button.addEventListener('click', () => playFullPreview(Number(button.dataset.seek)));
});
fullPreview.addEventListener('play', () => heroVideo.pause());
fullPreview.addEventListener('pause', syncHeroPlayback);
fullPreview.addEventListener('error', () => {
  filmFailed = true;
  const note = document.querySelector('.film-note');
  if (note) note.textContent = 'Chưa tải được video. Vui lòng tải lại trang hoặc xem các màn hình ứng dụng phía trên.';
});

// Tie the chapter highlight and elapsed time to actual playback.
const filmToggle = document.querySelector('[data-film-toggle]');
const filmElapsed = document.getElementById('film-elapsed');
const filmMoments = [...document.querySelectorAll('[data-seek]')];
function syncFilm() {
  const time = fullPreview.currentTime || 0;
  if (filmElapsed) filmElapsed.textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  if (filmToggle) {
    filmToggle.querySelector('span').textContent = fullPreview.ended ? 'Xem lại video' : fullPreview.paused ? 'Phát video' : 'Tạm dừng video';
    filmToggle.querySelector('path').setAttribute('d', fullPreview.paused ? 'M1 1.5v11l10-5.5z' : 'M1 1h3v12H1zM8 1h3v12H8z');
  }
  filmMoments.forEach((button, index) => {
    const start = Number(button.dataset.seek);
    const end = Number(filmMoments[index + 1]?.dataset.seek ?? fullPreview.duration) || 20;
    const active = time >= start && (time < end || index === filmMoments.length - 1);
    if (active && fullPreview.getAttribute('src')) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
    button.style.setProperty('--moment-progress', Math.max(0, Math.min(1, (time - start) / (end - start))));
  });
}
['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata', 'seeked'].forEach(event => fullPreview.addEventListener(event, syncFilm));
syncFilm();
