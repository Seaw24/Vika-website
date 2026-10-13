import { supabase } from './supabase.js';
import { currentEmail, loadTeam, flushPending } from './data.js?v=20261012v';
import { renderSignIn } from './views/signin.js?v=20261012v';
import { esc, toast, icon, initial } from './ui.js?v=20261012v';

// Threads and TikTok are two separate spaces (Nam, 2026-10-09). Each has its own tabs; a side rail on a computer and
// a switch in the phone header move between them. Only members Nam lets in (members.tiktok) get the switch and the
// TikTok space; a new member starts without it and sees Threads exactly as before.
// Nhóm: every member sees the whole team's posts, by day (Nam, 2026-09-27).
const SPACES = {
  threads: { label: 'Threads', icon: 'threads', home: '#/',
    tabs: [['#/', 'Hôm nay', 'today'], ['#/so-lieu', 'Số liệu', 'stats'], ['#/nhom', 'Nhóm', 'team'], ['#/gop-y', 'Góp ý', 'feedback'], ['#/cai-dat', 'Cài đặt', 'settings']] },
  tiktok: { label: 'TikTok', icon: 'tiktok', home: '#/tiktok',
    tabs: [['#/tiktok', 'Chờ đăng', 'tiktok'], ['#/tiktok/da-dang', 'Đã đăng', 'check'], ['#/tiktok/bo-qua', 'Đã bỏ qua', 'flag']] },
};
// Each TikTok page and the part of the view it shows.
const TIKTOK_PAGES = { '#/tiktok': 'queue', '#/tiktok/da-dang': 'posted', '#/tiktok/bo-qua': 'skipped' };
// The sign-in screen paints with no active tab (null), which belongs to no space's tabs.
const spaceOf = (hash) => (String(hash ?? '').startsWith('#/tiktok') ? 'tiktok' : 'threads');
let main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const me = document.getElementById('me');
const rail = document.getElementById('spaces');
const switcher = document.getElementById('spaces-m');
const theme = document.querySelector('meta[name="theme-color"]');
if (!location.hash) history.replaceState(null, '', '#/');
let ctx = null;
let booting = null;
let routeId = 0;

// Views load lazily so a failure in one never blocks sign-in.
const views = {
  today: () => import('./views/today.js?v=20261012v').then((m) => m.renderToday),
  card: () => import('./views/card.js?v=20261012v').then((m) => m.renderCard),
  answers: () => import('./views/answers.js?v=20261012v').then((m) => m.renderAnswers),
  settings: () => import('./views/settings.js?v=20261012v').then((m) => m.renderSettings),
  stats: () => import('./views/stats.js?v=20261012v').then((m) => m.renderStats),
  review: () => import('./views/review.js?v=20261012v').then((m) => m.renderReview),
  team: () => import('./views/team.js?v=20261012v').then((m) => m.renderTeam),
  tiktok: () => import('./views/tiktok.js?v=20261012v').then((m) => m.renderTikTok),
};

// The space links remember the last page opened in each space, so switching back lands where she left off.
const lastIn = { threads: '#/', tiktok: '#/tiktok' };
// The tab bar's active hash for the route being painted; its shell goes on when the page replaces the old one.
let shellFor = null;
function paintTabs(active) {
  const space = spaceOf(active);
  shellFor = active;
  if (ctx?.me) {
    lastIn[space] = location.hash || active;
    storage.set('studio.space', space);
    if (space === 'tiktok') storage.set('studio.space.tiktok', lastIn.tiktok);
  }
  tabs.innerHTML = ctx?.me
    ? SPACES[space].tabs.map(([href, label, name]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${icon(name)}<span>${esc(label)}</span></a>`).join('')
    : '';
  const both = ctx?.me?.tiktok === true;
  document.body.classList.toggle('spaces-on', both);
  const links = (cls) => Object.entries(SPACES).map(([key, s]) => `<a class="${cls}" href="${key === space ? s.home : lastIn[key]}"${key === space ? ' aria-current="true"' : ''}>${icon(s.icon)}<span>${esc(s.label)}</span></a>`).join('');
  rail.innerHTML = both ? links('space') : '';
  switcher.innerHTML = both ? links('space-m') : '';
  me.innerHTML = ctx?.me ? `<span class="me-name">${esc(ctx.me.name)}</span><i class="av">${esc(initial(ctx.me.name))}</i>` : '';
  if (ctx?.me) me.setAttribute('aria-label', `${ctx.me.name}, cài đặt`);
}

// The TikTok space wears TikTok's shell (Nam, 2026-10-11): black, the feed full screen on a phone under floating
// bars, a sidebar on a computer. Android's status bar and Safari's top tint follow the theme color. It goes on with
// the page (or its skeleton), so the page being left never shows on black.
function paintShell(active, signedIn = Boolean(ctx?.me)) {
  const tt = signedIn && spaceOf(active) === 'tiktok';
  document.body.classList.toggle('tt-shell', tt);
  document.body.classList.toggle('tt-feed', tt && active === '#/tiktok');
  if (theme) theme.content = tt ? '#000000' : '#F4EEE2';
}

// Page modes: the sign-in gate hides the shell; a focused task swaps the phone tab bar for its own dock.
function mode(target, { gate = false, focus = false, narrow = false } = {}) {
  document.body.classList.toggle('gate', gate);
  document.body.classList.toggle('focus', focus);
  target.classList.toggle('narrow', narrow);
}

const failed = () => `<div class="empty" style="margin-top:24px"><h2>Chưa tải được</h2><p>Kiểm tra mạng rồi thử lại.</p>
  <p style="margin-top:16px"><button class="btn btn-ink" id="retry">Thử lại</button></p></div>`;

const skLine = (width) => `<span class="sk-line" style="--sk-width:${width}%"></span>`;
const skCard = (index) => `<div class="sk-card" style="--sk-index:${index}">
  ${skLine(36)}${skLine(84)}${skLine(62)}<span class="sk-pill"></span></div>`;
function routeSkeleton(hash) {
  const feedback = hash === '#/gop-y';
  const today = hash === '#/' || hash === '';
  const head = `<div class="sk-head">${skLine(22)}${skLine(60)}${skLine(78)}</div>`;
  // TikTok: the feed's black frame, or the cover grid, the shape each page lands in.
  if (hash === '#/tiktok') {
    return '<div class="route-skeleton sk-ttf" role="status"><span class="sr-only">Đang tải trang</span><span class="sk-ttf-frame" aria-hidden="true"></span></div>';
  }
  if (hash === '#/tiktok/da-dang' || hash === '#/tiktok/bo-qua') {
    return `<div class="route-skeleton tt-grid-page" role="status"><span class="sr-only">Đang tải trang</span>
      <div class="tt-covers" aria-hidden="true">${'<span class="sk-cover"></span>'.repeat(9)}</div></div>`;
  }
  const cards = Array.from({ length: feedback ? 3 : 2 }, (_, i) => feedback
    ? `<div class="sk-entry" style="--sk-index:${i}"><span class="sk-avatar"></span>${skCard(i)}</div>`
    : skCard(i)).join('');
  return `<div class="route-skeleton${feedback ? ' sk-narrow' : ''}" role="status">
    <span class="sr-only">Đang tải trang</span><div aria-hidden="true">
    ${today ? `<div class="sk-stage">${head}<div class="sk-tickets">${cards}</div></div>`
      : `${head}<div class="sk-list">${cards}</div>`}</div></div>`;
}

async function route() {
  const started = performance.now();
  const id = ++routeId;
  const hash = location.hash || '#/';
  const nextMain = document.createElement('main');
  nextMain.id = 'main';
  nextMain.tabIndex = -1;
  document.body.classList.add('loading');
  const wait = setTimeout(() => {
    if (id !== routeId) return;
    main.setAttribute('aria-busy', 'true');
    paintShell(shellFor);
    main.innerHTML = routeSkeleton(hash);
  }, 120);
  try {
    if (!ctx?.me) {
      paintTabs(null);
      mode(nextMain, { gate: true });
      await renderSignIn(nextMain, ctx);
    } else if (hash.startsWith('#/bai/')) {
      paintTabs('#/');
      mode(nextMain, { focus: true });
      await (await views.card())(nextMain, ctx, decodeURIComponent(hash.slice('#/bai/'.length)));
    } else if (hash === '#/so-lieu') {
      paintTabs('#/so-lieu');
      mode(nextMain);
      await (await views.stats())(nextMain, ctx);
    } else if (hash === '#/nhom') {
      paintTabs('#/nhom');
      mode(nextMain);
      await (await views.team())(nextMain, ctx);
    } else if (TIKTOK_PAGES[hash] && ctx.me.tiktok === true) {
      paintTabs(hash);
      mode(nextMain);
      await (await views.tiktok())(nextMain, ctx, TIKTOK_PAGES[hash]);
    } else if (hash.startsWith('#/cuoi-tuan/')) {
      paintTabs('#/');
      mode(nextMain, { narrow: true });
      await (await views.review())(nextMain, ctx, decodeURIComponent(hash.slice('#/cuoi-tuan/'.length)));
    } else if (hash === '#/gop-y') {
      paintTabs('#/gop-y');
      mode(nextMain, { narrow: true });
      await (await views.answers())(nextMain, ctx);
    } else if (hash === '#/cai-dat') {
      paintTabs('#/cai-dat');
      mode(nextMain, { narrow: true });
      await (await views.settings())(nextMain, ctx);
    } else {
      paintTabs('#/');
      mode(nextMain);
      await (await views.today())(nextMain, ctx);
    }
  } catch (error) {
    console.error(error);
    nextMain.innerHTML = failed();
    nextMain.querySelector('#retry').onclick = () => location.reload();
  }
  clearTimeout(wait);
  if (id !== routeId) return;
  document.body.classList.remove('loading');
  main.replaceWith(nextMain);
  main = nextMain;
  paintShell(shellFor);
  main.dataset.routeMs = String(Math.round(performance.now() - started));
  main.querySelectorAll('textarea').forEach((area) => area.dispatchEvent(new Event('input')));
  main.classList.add('enter');
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// The team (members, accounts, settings) is kept on the device, so a return visit opens at once from it while a
// fresh read runs behind; the page repaints only if the fresh read differs. Row-level security still guards every
// read and write, so a stale copy can show old names for a moment but never opens data.
const teamKey = (email) => `studio.team.v1.${email}`;
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
};
function readTeam(email) {
  try { return JSON.parse(storage.get(teamKey(email)) ?? 'null'); } catch { return null; }
}
function applyTeam(email, team) {
  const me = team.members.find((m) => m.email === email) ?? null;
  if (me && !me.is_fixture) {
    team = { ...team, members: team.members.filter((m) => !m.is_fixture) };
    team.accounts = team.accounts.filter((a) => team.members.some((m) => m.id === a.member_id));
  }
  ctx.team = team;
  ctx.me = me;
}

// Studio opens in the space she used last (Nam, 2026-10-09): Threads unless she was last in TikTok. Only an
// address with no page in it (the home screen icon, a bare link) follows the memory; a link to a page wins.
const bareStart = ['', '#', '#/'].includes(location.hash);
let firstRoute = true;
function restoreSpace() {
  if (!firstRoute) return;
  firstRoute = false;
  if (!bareStart || ctx.me?.tiktok !== true || storage.get('studio.space') !== 'tiktok') return;
  const last = storage.get('studio.space.tiktok');
  history.replaceState(null, '', TIKTOK_PAGES[last] ? last : '#/tiktok');
}

// Straight after sign-in, or on a first visit with no saved team, the shell leaves the sign-in screen at once and
// shows the page's skeleton while the team loads.
function bootSkeleton() {
  document.body.classList.remove('gate');
  document.body.classList.add('loading');
  // She is signed in but her team has not loaded, so a TikTok address paints the black skeleton.
  paintShell(location.hash || '#/', true);
  main.innerHTML = routeSkeleton(location.hash || '#/');
}

async function boot() {
  const email = await currentEmail();
  ctx = { email, me: null, team: null, reload: reboot };
  if (!email) { await route(); return; }
  const cached = readTeam(email);
  const fresh = loadTeam();
  // The page's code downloads while the team loads.
  const warm = { '#/tiktok': 'tiktok', '#/tiktok/da-dang': 'tiktok', '#/tiktok/bo-qua': 'tiktok', '#/so-lieu': 'stats', '#/nhom': 'team', '#/gop-y': 'answers', '#/cai-dat': 'settings' };
  views[warm[location.hash] ?? (location.hash.startsWith('#/bai/') ? 'card' : 'today')]().catch(() => {});
  if (cached) {
    applyTeam(email, cached);
    restoreSpace();
    await route();
    fresh.then((team) => {
      const text = JSON.stringify(team);
      storage.set(teamKey(email), text);
      if (text === JSON.stringify(cached)) return;
      applyTeam(email, team);
      route();
    }).catch((error) => console.error(error));
  } else {
    bootSkeleton();
    const team = await fresh;
    storage.set(teamKey(email), JSON.stringify(team));
    applyTeam(email, team);
    restoreSpace();
    await route();
  }
  flushPending();
}

function reboot() {
  booting ??= boot().catch((error) => {
    console.error(error);
    document.body.classList.remove('loading');
    main.innerHTML = failed();
    main.querySelector('#retry').onclick = reboot;
  }).finally(() => { booting = null; });
  return booting;
}

// Never await Supabase calls inside this callback; schedule them instead.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(reboot, 0);
});
window.addEventListener('hashchange', route);
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 8), { passive: true });
window.addEventListener('online', () => flushPending());
window.addEventListener('studio:rejected', () => {
  toast('Một thao tác không lưu được vì bài đã thay đổi hoặc bạn không có quyền. Mở lại bài để xem trạng thái mới.');
});
reboot();
