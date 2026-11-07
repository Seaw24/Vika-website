// Cài đặt, for managers only: each member's weekly plan of seeding and creative posts, one count per weekday (Nam,
// 2026-11-03: "Monday could have a KPI of one seeding, one creative, but Tuesday can have like two seeding, one
// creative"). Bảng vàng ticks a day she meets it. A new plan starts today; past days keep theirs. Đặt mục tiêu on
// Bảng vàng and Đổi mục tiêu on a profile land here.
import { isManager, loadTargets, setMemberTarget } from '../data.js?v=20261107a';
import { planOn } from '../lib/board.js?v=20261107a';
import { vnDate } from '../lib/week.js?v=20261107a';
import { esc, toast, face } from '../ui.js?v=20261107a';

export const FOCUS_KEY = 'studio.targets.focus';
const MAX = 20;
const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const PARTS = [['seeding', 'Seeding'], ['creative', 'Sáng tạo']];
const dm = (iso) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const total = (list) => list.reduce((s, x) => s + x, 0);

function note(ctx, plan) {
  if (!plan.set) return 'Mặc định: mỗi ngày một bài seeding cho mỗi tài khoản seeding';
  const by = ctx.team.members.find((x) => x.id === plan.by)?.name;
  return `${by ? `${by} đặt` : 'Đã đặt'}${plan.at ? ` ngày ${dm(vnDate(new Date(plan.at)))}` : ''}`;
}

// The week as two rows of numbers; in edit mode each number has a + above and a − below.
function gridHtml(plan, edit) {
  const cell = (part, i) => {
    const v = plan[part][i];
    if (!edit) return `<span class="tq-n${v ? '' : ' zero'}">${v}</span>`;
    return `<span class="tq-n edit"><button type="button" data-part="${part}" data-i="${i}" data-d="1" aria-label="Thêm một bài ${part === 'seeding' ? 'seeding' : 'sáng tạo'} ${DAYS[i]}" ${v >= MAX ? 'disabled' : ''}>+</button>
      <output>${v}</output><button type="button" data-part="${part}" data-i="${i}" data-d="-1" aria-label="Bớt một bài ${part === 'seeding' ? 'seeding' : 'sáng tạo'} ${DAYS[i]}" ${v <= 0 ? 'disabled' : ''}>−</button></span>`;
  };
  return `<div class="tq-grid${edit ? ' is-edit' : ''}" role="table">
    <span class="tq-h" role="columnheader"></span>${DAYS.map((d) => `<span class="tq-h" role="columnheader">${d}</span>`).join('')}<span class="tq-h" role="columnheader">Tuần</span>
    ${PARTS.map(([part, label]) => `<span class="tq-l ${part}" role="rowheader"><i></i>${label}</span>${plan[part].map((_, i) => cell(part, i)).join('')}<b class="tq-t">${total(plan[part])}</b>`).join('')}
  </div>`;
}

function rowHtml(ctx, m, plan, edit) {
  const rest = plan.seeding.map((s, i) => s + plan.creative[i] === 0 ? DAYS[i] : null).filter(Boolean);
  return `<li class="tq-row${edit ? ' is-edit' : ''}" data-member="${esc(m.id)}">
    <div class="tq-top"><span class="tq-who">${face(m)}<span><b>${esc(m.name)}</b><small>${esc(note(ctx, plan))}${rest.length && rest.length < 7 ? ` · nghỉ ${rest.join(', ')}` : ''}</small></span></span>
      ${edit ? '' : '<button type="button" class="btn btn-line sm" data-edit>Sửa</button>'}</div>
    ${gridHtml(plan, edit)}
    ${edit ? `<div class="tq-acts"><button type="button" class="linkish" data-copy>Sao chép T2 cho cả tuần</button>
      <span class="tq-acts-r"><button type="button" class="btn btn-line sm" data-cancel>Huỷ</button><button type="button" class="btn btn-ink sm" data-save>Lưu, áp dụng từ hôm nay</button></span></div>` : ''}
  </li>`;
}

export async function showTargetsPanel(host, ctx) {
  const manager = await isManager().catch((error) => { console.error(error); return false; });
  if (!manager || !host?.isConnected || host.querySelector('#targets')) return;
  const targets = await loadTargets().catch((error) => { console.error(error); return null; });
  if (!host.isConnected) return;
  const today = vnDate();
  const members = ctx.team.members.filter((m) => !m.is_demo);
  const plans = new Map(members.map((m) => [m.id, planOn(targets ?? [], ctx.team.accounts, m.id, today)]));
  host.insertAdjacentHTML('beforeend', `<section class="panel tq-panel" id="targets">
    <header><h2>Mục tiêu theo ngày</h2>
      <p class="small muted">Mỗi người có một lịch cho cả tuần: số bài seeding và sáng tạo cần đăng vào từng ngày, lặp lại mỗi tuần. Bảng vàng đánh dấu ngày đạt. Lịch mới tính từ hôm nay; các ngày trước giữ lịch cũ. Ngày đặt 0 bài là ngày nghỉ.</p></header>
    ${targets ? '<ul></ul>' : '<p class="warn">Chưa tải được mục tiêu. Tải lại trang nhé.</p>'}</section>`);
  const panel = host.querySelector('#targets');
  const list = panel.querySelector('ul');
  if (!list) return;
  const paintRow = (m, edit = false, draft = null) => {
    const plan = draft ?? plans.get(m.id);
    const old = list.querySelector(`[data-member="${CSS.escape(m.id)}"]`);
    const html = rowHtml(ctx, m, plan, edit);
    if (old) old.outerHTML = html; else list.insertAdjacentHTML('beforeend', html);
    wireRow(ctx, list.querySelector(`[data-member="${CSS.escape(m.id)}"]`), m, plan, edit, paintRow, plans);
  };
  members.forEach((m) => paintRow(m));
  let focus = null;
  try { focus = sessionStorage.getItem(FOCUS_KEY); sessionStorage.removeItem(FOCUS_KEY); } catch { /* storage blocked */ }
  // '*' comes from Bảng vàng's Đặt mục tiêu: the panel itself; a member id from her profile: her row, opened.
  const member = members.find((m) => m.id === focus);
  if (member) paintRow(member, true);
  const target = focus === '*' ? panel : member && list.querySelector(`[data-member="${CSS.escape(member.id)}"]`);
  if (target) { if (target !== panel) target.classList.add('is-focus'); target.scrollIntoView({ block: focus === '*' ? 'start' : 'center', behavior: 'smooth' }); }
}

function wireRow(ctx, row, m, plan, edit, paintRow, plans) {
  if (!edit) { row.querySelector('[data-edit]').onclick = () => paintRow(m, true, { ...plan, seeding: [...plan.seeding], creative: [...plan.creative] }); return; }
  const draft = plan;
  row.querySelectorAll('[data-d]').forEach((b) => {
    b.onclick = () => {
      const { part, i, d } = b.dataset;
      draft[part][i] = Math.max(0, Math.min(MAX, draft[part][i] + Number(d)));
      paintRow(m, true, draft);
      row.ownerDocument.querySelector(`[data-member="${CSS.escape(m.id)}"] [data-part="${part}"][data-i="${i}"][data-d="${d}"]`)?.focus();
    };
  });
  row.querySelector('[data-copy]').onclick = () => {
    for (const [part] of PARTS) draft[part] = Array(7).fill(draft[part][0]);
    paintRow(m, true, draft);
  };
  row.querySelector('[data-cancel]').onclick = () => paintRow(m);
  row.querySelector('[data-save]').onclick = async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      const saved = await setMemberTarget(m.id, draft.seeding, draft.creative);
      plans.set(m.id, { seeding: [...draft.seeding], creative: [...draft.creative], set: true, by: ctx.me.id, at: saved?.created_at ?? new Date().toISOString() });
      const s = draft.seeding.reduce((a, x) => a + x, 0);
      const c = draft.creative.reduce((a, x) => a + x, 0);
      toast(s + c ? `Đã lưu lịch của ${m.name}: ${s} seeding, ${c} sáng tạo mỗi tuần.` : `Từ hôm nay ${m.name} được nghỉ cả tuần.`);
      paintRow(m);
    } catch (error) {
      console.error(error);
      toast(error?.code === '42501' ? 'Chỉ quản lý mới được đặt mục tiêu.' : 'Chưa lưu được. Thử lại nhé.');
      button.disabled = false;
    }
  };
}
