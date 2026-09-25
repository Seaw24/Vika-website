import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await fs.readFile('home-video.js', 'utf8');
const html = await fs.readFile('index.html', 'utf8');
const heroMarkup = html.match(/<video\b[^>]*id="hero-video"[^>]*>/)[0];
const sessionMarkup = html.match(/<video\b[^>]*id="full-preview"[^>]*>/)[0];
assert.match(heroMarkup, /data-src="assets\/home\/app-preview\.mp4"/);
assert.match(heroMarkup, /\bloop\b/);
assert.doesNotMatch(heroMarkup, /data-start/);
assert.match(sessionMarkup, /data-src="assets\/home\/session-preview\.mp4"/);
assert.match(sessionMarkup, /poster="assets\/home\/session-poster\.jpg"/);
assert.match(sessionMarkup, /\bmuted\b/);
assert.match(sessionMarkup, /\bloop\b/);
assert.deepEqual([...html.matchAll(/data-seek="(\d+)"/g)].map(match => Number(match[1])), [0, 3, 13]);
function fixture(reducedMotion, saveData = false) {
  const observers = new Map();
  const element = (dataSrc = '') => ({
    paused: true, readyState: 1, currentTime: 0, dataset: { src: dataSrc }, events: {}, classList: { add() {}, remove() {} },
    addEventListener(name, fn) { const before = this.events[name]; this.events[name] = (...args) => { before?.(...args); fn(...args); }; },
    getAttribute() { return this.src || null; },
    play() { this.paused = false; this.events.play?.(); this.events.playing?.(); return Promise.resolve(); },
    pause() { const wasPlaying = !this.paused; this.paused = true; if (wasPlaying) this.events.pause?.(); },
  });
  const control = (dataset = {}) => ({ dataset, events: {}, attributes: {}, style: { setProperty() {} }, hasAttribute(name) { return name === 'data-film-toggle' && this.dataset.toggle; }, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; }, addEventListener(name, fn) { this.events[name] = fn; } });
  const nodes = { 'hero-video': element('hero.mp4'), 'hero-video-toggle': element(), 'full-preview': element('full.mp4') };
  nodes['hero-video'].duration = 29.6;
  nodes['full-preview'].duration = 20;
  const controls = { play: control(), seek: control({ seek: '13' }), toggle: control({ toggle: true }) };
  const label = {}, icon = { setAttribute() {} };
  controls.toggle.querySelector = selector => selector === 'span' ? label : icon;
  const document = {
    hidden: false, events: {},
    getElementById: id => nodes[id],
    querySelectorAll: selector => selector === '[data-play-preview]' ? [controls.play, controls.toggle] : selector === '[data-seek]' ? [controls.seek] : [],
    querySelector: selector => selector === '[data-film-toggle]' ? controls.toggle : null,
    addEventListener(name, fn) { this.events[name] = fn; },
  };
  const context = {
    document, navigator: { connection: { saveData } },
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {} }),
    IntersectionObserver: class { constructor(callback) { this.callback = callback; } observe(target) { observers.set(target, this.callback); } },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const observer = { notify: observers.get(nodes['hero-video']), film: observers.get(nodes['full-preview']) };
  observer.notify([{ isIntersecting: true }]);
  return { nodes, controls, observer, document };
}

// Reduced motion and data saver both keep every video unloaded until asked.
for (const [reducedMotion, saveData] of [[true, false], [false, true]]) {
  const { nodes, observer, controls } = fixture(reducedMotion, saveData);
  observer.film([{ isIntersecting: true, intersectionRatio: 1 }]);
  assert.equal(nodes['hero-video'].src, undefined);
  assert.equal(nodes['full-preview'].src, undefined);
  nodes['hero-video-toggle'].events.click();
  assert.equal(nodes['hero-video'].paused, false);
  controls.play.events.click();
  assert.equal(nodes['full-preview'].paused, false, 'The visitor can still start the session manually');
}

// The session starts on scroll, pauses offscreen, and resumes when visible again.
{
  const { nodes, controls, observer, document } = fixture(false);
  const film = nodes['full-preview'];
  assert.equal(film.src, undefined, 'Offscreen film does not load');
  observer.film([{ isIntersecting: true, intersectionRatio: 0.1 }]);
  assert.equal(film.src, undefined, 'A sliver of the player does not start playback');
  observer.film([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  assert.equal(film.paused, false);
  assert.equal(nodes['hero-video'].paused, true);
  assert.equal(controls.toggle.querySelector('span').textContent, 'Tạm dừng video');
  observer.film([{ isIntersecting: false, intersectionRatio: 0 }]);
  assert.equal(film.paused, true);
  observer.film([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  assert.equal(film.paused, false);
  document.hidden = true;
  document.events.visibilitychange();
  assert.equal(film.paused, true);
  document.hidden = false;
  document.events.visibilitychange();
  assert.equal(film.paused, false);

  // A deliberate pause survives scrolling and tab visibility changes.
  controls.toggle.events.click();
  observer.film([{ isIntersecting: false, intersectionRatio: 0 }]);
  observer.film([{ isIntersecting: true, intersectionRatio: 1 }]);
  document.events.visibilitychange();
  assert.equal(film.paused, true);
  controls.toggle.events.click();
  assert.equal(film.paused, false);
}

const { nodes, controls, observer, document } = fixture(false);
assert.equal(nodes['hero-video'].currentTime, 0, 'The full hero video starts at the beginning');
assert.equal(nodes['hero-video'].paused, false);
observer.notify([{ isIntersecting: false }]);
assert.equal(nodes['hero-video'].paused, true);
observer.notify([{ isIntersecting: true }]);
assert.equal(nodes['hero-video'].paused, false);

// A manual pause sticks across visibility changes.
nodes['hero-video-toggle'].events.click();
observer.notify([{ isIntersecting: false }]);
observer.notify([{ isIntersecting: true }]);
assert.equal(nodes['hero-video'].paused, true);

// Playing the full preview loads it on demand and pauses the hero.
nodes['hero-video-toggle'].events.click();
assert.equal(nodes['hero-video'].paused, false);
controls.play.events.click();
assert.equal(nodes['full-preview'].src, 'full.mp4');
assert.equal(nodes['full-preview'].paused, false);
assert.equal(nodes['hero-video'].paused, true);

// Moment buttons seek within the loaded preview.
controls.seek.events.click();
assert.equal(nodes['full-preview'].currentTime, 13);
nodes['full-preview'].events.timeupdate();
assert.equal(controls.seek.attributes['aria-current'], 'true');
controls.toggle.events.click();
assert.equal(nodes['full-preview'].paused, true);
assert.equal(controls.toggle.querySelector('span').textContent, 'Phát video');
controls.toggle.events.click();
assert.equal(nodes['full-preview'].paused, false);
assert.equal(controls.toggle.querySelector('span').textContent, 'Tạm dừng video');

// Hiding the tab pauses the preview; the hero waits until the preview is paused.
document.hidden = true;
document.events.visibilitychange();
assert.equal(nodes['full-preview'].paused, true);
assert.equal(nodes['hero-video'].paused, true);
document.hidden = false;
document.events.visibilitychange();
assert.equal(nodes['hero-video'].paused, false);
console.log('Passed session autoplay, scroll and tab visibility, persistent pause, reduced-motion, data-saver, hero, and chapter seek cases.');
