import { supabase } from './supabase.js';
import { currentEmail, loadTeam, flushPending } from './data.js?v=20261009a';
import { renderSignIn } from './views/signin.js?v=20261009a';
import { esc, toast, icon, initial } from './ui.js';

// Nhóm: every member sees the whole team's posts, by day (Nam, 2026-09-27).
const TABS = [['#/', 'Hôm nay', 'today'], ['#/so-lieu', 'Số liệu', 'stats'], ['#/nhom', 'Nhóm', 'team'], ['#/gop-y', 'Góp ý', 'feedback'], ['#/cai-dat', 'Cài đặt', 'settings']];
let main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const me = document.getElementById('me');
if (!location.hash) history.replaceState(null, '', '#/');
let ctx = null;
let booting = null;
let routeId = 0;

// Views load lazily so a failure in one never blocks sign-in.
const views = {
  today: () => import('./views/today.js?v=20261009a').then((m) => m.renderToday),
  card: () => import('./views/card.js?v=20261009a').then((m) => m.renderCard),
  answers: () => import('./views/answers.js?v=20261009c').then((m) => m.renderAnswers),
  settings: () => import('./views/settings.js?v=20261009a').then((m) => m.renderSettings),
  stats: () => import('./views/stats.js?v=20261009a').then((m) => m.renderStats),
  review: () => import('./views/review.js?v=20261009a').then((m) => m.renderReview),
  team: () => import('./views/team.js?v=20261009a').then((m) => m.renderTeam),
};

function paintTabs(active) {
  tabs.innerHTML = ctx?.me
    ? TABS.map(([href, label, name]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${icon(name)}<span>${esc(label)}</span></a>`).join('')
    : '';
  me.innerHTML = ctx?.me ? `<span class="me-name">${esc(ctx.me.name)}</span><i class="av">${esc(initial(ctx.me.name))}</i>` : '';
  if (ctx?.me) me.setAttribute('aria-label', `${ctx.me.name}, cài đặt`);
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
  main.dataset.routeMs = String(Math.round(performance.now() - started));
  main.querySelectorAll('textarea').forEach((area) => area.dispatchEvent(new Event('input')));
  main.classList.add('enter');
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function boot() {
  const email = await currentEmail();
  ctx = { email, me: null, team: null, reload: reboot };
  if (email) {
    ctx.team = await loadTeam();
    ctx.me = ctx.team.members.find((m) => m.email === email.toLowerCase()) ?? null;
    if (ctx.me && !ctx.me.is_fixture) {
      ctx.team.members = ctx.team.members.filter((m) => !m.is_fixture);
      ctx.team.accounts = ctx.team.accounts.filter((a) => ctx.team.members.some((m) => m.id === a.member_id));
    }
  }
  await route();
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
