// Motion stays optional. Native scrolling and links work without this file.
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 901px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const scrollBehavior = () => reduceMotion.matches ? 'instant' : 'smooth';
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  let scrollFrame = 0;

  function syncScroll() {
    scrollFrame = 0;
    nav?.classList.toggle('is-floating', scrollY > 40);
    const range = document.documentElement.scrollHeight - innerHeight;
    document.documentElement.style.setProperty('--reading-progress', range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0);
    if (!hero || reduceMotion.matches || !desktop.matches) return;
    const rect = hero.getBoundingClientRect();
    if (rect.bottom <= 0) return;
    hero.style.setProperty('--hero-parallax', `${Math.min(hero.offsetHeight * .04, Math.max(0, -rect.top) * .09)}px`);
  }
  function requestScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScroll);
  }
  addEventListener('scroll', requestScroll, { passive: true });
  addEventListener('resize', requestScroll, { passive: true });
  document.addEventListener('toggle', requestScroll, true);
  if ('ResizeObserver' in window) new ResizeObserver(requestScroll).observe(document.body);
  syncScroll();

  const menu = document.querySelector('.mobile-menu');
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { menu.open = false; }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', event => {
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  });

  // Reveal once. Content is visible if observers or JavaScript are unavailable.
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -4% 0px', threshold: .06 });
    document.querySelectorAll('[data-reveal], [data-stagger]').forEach(element => revealObserver.observe(element));
    document.documentElement.classList.add('motion-ready');
    const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
    const navObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(link => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('main > section').forEach(section => navObserver.observe(section));
  }

  // The phone follows the pointer by at most three degrees. Stop rendering at rest.
  if (hero) {
    const phone = hero.querySelector('.hero-device');
    let frame = 0;
    let x = 0, y = 0, targetX = 0, targetY = 0;
    const allowed = () => !reduceMotion.matches && desktop.matches && finePointer.matches && !document.hidden;
    function drawDepth() {
      frame = 0;
      x += (targetX - x) * .12;
      y += (targetY - y) * .12;
      if (Math.abs(targetX - x) < .002 && Math.abs(targetY - y) < .002) { x = targetX; y = targetY; }
      phone.style.setProperty('--tilt-x', `${-y * 2.5}deg`);
      phone.style.setProperty('--tilt-y', `${x * 3}deg`);
      phone.style.setProperty('--phone-lift', `${y * -3}px`);
      phone.style.setProperty('--callout-x', `${x * 7}px`);
      phone.style.setProperty('--callout-y', `${y * 5}px`);
      if (x !== targetX || y !== targetY) frame = requestAnimationFrame(drawDepth);
    }
    function resetDepth() {
      cancelAnimationFrame(frame);
      frame = 0;
      x = y = targetX = targetY = 0;
      ['--tilt-x', '--tilt-y', '--phone-lift', '--callout-x', '--callout-y'].forEach(property => phone.style.removeProperty(property));
      hero.style.removeProperty('--hero-parallax');
    }
    hero.addEventListener('pointermove', event => {
      if (!allowed()) return;
      const rect = hero.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width * 2 - 1;
      targetY = (event.clientY - rect.top) / rect.height * 2 - 1;
      if (!frame) frame = requestAnimationFrame(drawDepth);
    }, { passive: true });
    hero.addEventListener('pointerleave', () => {
      targetX = targetY = 0;
      if (!frame && allowed()) frame = requestAnimationFrame(drawDepth);
    });
    [reduceMotion, desktop, finePointer].forEach(query => query.addEventListener('change', resetDepth));
    document.addEventListener('visibilitychange', resetDepth);
  }

  const steps = document.querySelector('.steps');
  const stepControls = document.querySelector('.step-controls');
  if (steps && stepControls) {
    const items = [...steps.children];
    const previous = stepControls.querySelector('[data-step-prev]');
    const next = stepControls.querySelector('[data-step-next]');
    const current = document.getElementById('step-current');
    let step = 0, stepFrame = 0;
    function syncSteps() {
      stepFrame = 0;
      const start = steps.getBoundingClientRect().left + parseFloat(getComputedStyle(steps).paddingLeft);
      step = items.reduce((nearest, item, index) => Math.abs(item.getBoundingClientRect().left - start) < Math.abs(items[nearest].getBoundingClientRect().left - start) ? index : nearest, 0);
      if (steps.scrollLeft + steps.clientWidth >= steps.scrollWidth - 4) step = items.length - 1;
      current.textContent = String(step + 1).padStart(2, '0');
      stepControls.style.setProperty('--step-progress', (step + 1) / items.length);
      previous.disabled = step === 0;
      next.disabled = step === items.length - 1;
    }
    function goToStep(index) {
      const padding = parseFloat(getComputedStyle(steps).paddingLeft);
      const delta = items[index].getBoundingClientRect().left - steps.getBoundingClientRect().left - padding;
      steps.scrollBy({ left: delta, behavior: scrollBehavior() });
    }
    previous.addEventListener('click', () => goToStep(Math.max(0, step - 1)));
    next.addEventListener('click', () => goToStep(Math.min(items.length - 1, step + 1)));
    steps.addEventListener('scroll', () => { if (!stepFrame) stepFrame = requestAnimationFrame(syncSteps); }, { passive: true });
    stepControls.hidden = false;
    desktop.addEventListener('change', syncSteps);
    syncSteps();
  }

  // The screen follows the chapter in view. No scrolling is intercepted.
  const container = document.getElementById('chapters');
  const chapters = [...document.querySelectorAll('[data-chapter]')];
  if (!container || !chapters.length) return;
  const announce = name => document.dispatchEvent(new CustomEvent('vika:screen', { detail: name }));
  let chapterObserver, horizontalFrame = 0;
  function watchVertical() {
    chapterObserver?.disconnect();
    if (!('IntersectionObserver' in window)) return;
    chapterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) announce(entry.target.dataset.chapter); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    chapters.forEach(chapter => chapterObserver.observe(chapter));
  }
  function onHorizontalScroll() {
    if (horizontalFrame) return;
    horizontalFrame = requestAnimationFrame(() => {
      horizontalFrame = 0;
      const rect = container.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const nearest = chapters.reduce((a, b) => {
        const first = a.getBoundingClientRect(), second = b.getBoundingClientRect();
        return Math.abs(first.left + first.width / 2 - center) < Math.abs(second.left + second.width / 2 - center) ? a : b;
      });
      announce(nearest.dataset.chapter);
    });
  }
  function applyLayout() {
    container.removeEventListener('scroll', onHorizontalScroll);
    if (desktop.matches) watchVertical();
    else {
      chapterObserver?.disconnect();
      container.addEventListener('scroll', onHorizontalScroll, { passive: true });
      onHorizontalScroll();
    }
  }
  applyLayout();
  desktop.addEventListener('change', applyLayout);
  document.querySelectorAll('[data-index]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      announce(target.dataset.chapter);
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    });
  });
  document.querySelectorAll('.chapter-head').forEach(button => {
    button.addEventListener('click', () => {
      const chapter = button.closest('[data-chapter]');
      if (desktop.matches) chapter.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      else container.scrollBy({ left: chapter.getBoundingClientRect().left + chapter.offsetWidth / 2 - container.getBoundingClientRect().left - container.clientWidth / 2, behavior: scrollBehavior() });
    });
  });
})();
