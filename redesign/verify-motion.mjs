import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await fs.readFile('home-motion.js', 'utf8');
function fixture({ reduced = false, desktop = true, fine = true, observers = true } = {}) {
  const callbacks = new Map(), events = {}, classes = new Set(), values = new Map();
  let nextFrame = 0;
  const style = { setProperty(key, value) { values.set(key, value); }, removeProperty(key) { values.delete(key); } };
  const phone = { style };
  const hero = { offsetHeight: 800, style, querySelector() { return phone; }, getBoundingClientRect() { return { left: 0, top: 0, bottom: 800, width: 1200, height: 800 }; }, addEventListener(event, handler) { events[event] = handler; } };
  const document = {
    hidden: false, body: {}, documentElement: { scrollHeight: 3000, style, classList: { add(value) { classes.add(value); } } },
    querySelector(selector) { return selector === '.hero' ? hero : null; },
    querySelectorAll() { return []; }, getElementById() { return null; },
    addEventListener(event, handler) { events[event] = handler; },
  };
  const context = {
    document, scrollY: 0, innerHeight: 900, addEventListener() {},
    matchMedia(query) { return { matches: query.includes('reduced') ? reduced : query.includes('min-width') ? desktop : fine, addEventListener() {} }; },
    requestAnimationFrame(callback) { const id = ++nextFrame; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
  };
  if (observers) context.IntersectionObserver = class { observe() {} unobserve() {} };
  context.window = context;
  vm.runInNewContext(source, context);
  function flush() {
    let frames = 0;
    while (callbacks.size && frames++ < 120) {
      const entries = [...callbacks.entries()];
      callbacks.clear();
      entries.forEach(([, callback]) => callback());
    }
    assert.equal(callbacks.size, 0, 'Pointer animation stops at rest');
  }
  return { events, document, values, callbacks, classes, flush };
}

for (const options of [{ reduced: true }, { desktop: false }, { fine: false }]) {
  const test = fixture(options);
  test.events.pointermove({ clientX: 1100, clientY: 700 });
  assert.equal(test.callbacks.size, 0, 'No decorative motion for reduced motion or touch');
}
const pointer = fixture();
pointer.events.pointermove({ clientX: 1200, clientY: 800 });
pointer.flush();
assert.equal(pointer.values.get('--tilt-y'), '3deg');
assert.equal(pointer.values.get('--tilt-x'), '-2.5deg');
pointer.events.pointerleave();
pointer.flush();
assert.equal(pointer.values.get('--tilt-y'), '0deg');
pointer.events.pointermove({ clientX: 1200, clientY: 800 });
pointer.document.hidden = true;
pointer.events.visibilitychange();
assert.equal(pointer.callbacks.size, 0, 'Hidden tabs stop rendering');
assert.equal(pointer.values.has('--tilt-y'), false);
assert.equal(fixture({ observers: false }).classes.has('motion-ready'), false, 'Unsupported observers leave content visible');
console.log('Passed reduced-motion, touch, pointer bounds, idle/hidden cleanup, and observer fallback checks.');
