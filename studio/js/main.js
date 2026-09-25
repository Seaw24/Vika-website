import { supabase } from './supabase.js';
import { currentEmail, loadTeam, flushPending } from './data.js';
import { renderSignIn } from './views/signin.js';
import { esc, toast, icon, initial } from './ui.js';

const TABS = [['#/', 'Hôm nay', 'today'], ['#/so-lieu', 'Số liệu', 'stats'], ['#/gop-y', 'Góp ý', 'feedback'], ['#/cai-dat', 'Cài đặt', 'settings']];
const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const me = document.getElementById('me');
if (!location.hash) history.replaceState(null, '', '#/');
let ctx = null;
let booting = null;

// Views load lazily so a failure in one never blocks sign-in.
const views = {
  today: () => import('./views/today.js').then((m) => m.renderToday),
  card: () => import('./views/card.js').then((m) => m.renderCard),
  answers: () => import('./views/answers.js').then((m) => m.renderAnswers),
  settings: () => import('./views/settings.js').then((m) => m.renderSettings),
  stats: () => import('./views/stats.js').then((m) => m.renderStats),
  review: () => import('./views/review.js').then((m) => m.renderReview),
};

function paintTabs(active) {
  tabs.innerHTML = ctx?.me
    ? TABS.map(([href, label, name]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${icon(name)}<span>${esc(label)}</span></a>`).join('')
    : '';
  me.innerHTML = ctx?.me ? `<span class="me-name">${esc(ctx.me.name)}</span><i class="av">${esc(initial(ctx.me.name))}</i>` : '';
  if (ctx?.me) me.setAttribute('aria-label', `${ctx.me.name}, cài đặt`);
}

// Page modes: the sign-in gate hides the shell; a focused task swaps the phone tab bar for its own dock.
function mode({ gate = false, focus = false, narrow = false } = {}) {
  document.body.classList.toggle('gate', gate);
  document.body.classList.toggle('focus', focus);
  main.classList.toggle('narrow', narrow);
}

const failed = () => `<div class="empty" style="margin-top:24px"><h2>Chưa tải được</h2><p>Kiểm tra mạng rồi thử lại.</p>
  <p style="margin-top:16px"><button class="btn btn-ink" id="retry">Thử lại</button></p></div>`;

async function route() {
  const hash = location.hash || '#/';
  document.body.classList.add('loading');
  try {
    if (!ctx?.me) {
      paintTabs(null);
      mode({ gate: true });
      await renderSignIn(main, ctx);
    } else if (hash.startsWith('#/bai/')) {
      paintTabs('#/');
      mode({ focus: true });
      await (await views.card())(main, ctx, decodeURIComponent(hash.slice('#/bai/'.length)));
    } else if (hash === '#/so-lieu') {
      paintTabs('#/so-lieu');
      mode();
      await (await views.stats())(main, ctx);
    } else if (hash.startsWith('#/cuoi-tuan/')) {
      paintTabs('#/');
      mode({ narrow: true });
      await (await views.review())(main, ctx, decodeURIComponent(hash.slice('#/cuoi-tuan/'.length)));
    } else if (hash === '#/gop-y') {
      paintTabs('#/gop-y');
      mode({ narrow: true });
      await (await views.answers())(main, ctx);
    } else if (hash === '#/cai-dat') {
      paintTabs('#/cai-dat');
      mode({ narrow: true });
      await (await views.settings())(main, ctx);
    } else {
      paintTabs('#/');
      mode();
      await (await views.today())(main, ctx);
    }
  } catch (error) {
    console.error(error);
    main.innerHTML = failed();
    main.querySelector('#retry').onclick = () => location.reload();
  }
  document.body.classList.remove('loading');
  main.classList.remove('enter');
  void main.offsetWidth;
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
