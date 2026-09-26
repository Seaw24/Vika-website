import { DAY } from './stats.js';

// This data only exists in browser memory after an explicit request to preview it.
// It is never written to Supabase or included in a collection/learning export.
// Everything comes from a seeded generator, so the same team always sees the same sample.

const HOUR = 3600000;
const VN = 7 * HOUR;
const OPS = ['Hôm nay bạn tập lúc mấy giờ?', 'Một buổi tập ngắn vẫn là một buổi tập.', 'Bạn giữ thói quen tập bằng cách nào?',
  'Tập 10 phút mỗi sáng có ăn thua gì không?', 'Mấy nay lười quá, ai kéo mình dậy tập với.', 'Ăn tối xong là muốn nằm, làm sao để đi tập?',
  'Tập ở nhà hay đi gym hợp với bạn hơn?', 'Bạn tập được mấy ngày một tuần rồi?', 'Có ai tập buổi trưa không?',
  'Buổi tập đầu tiên sau một tháng nghỉ, mệt mà vui.', 'Uống nước ấm buổi sáng có giúp gì không?', 'Tối nay tập 15 phút rồi mới xem phim.'];
const KEYWORDS = ['Tập ở nhà', 'Thói quen', 'Giảm mỡ bụng', 'Tập sáng', 'Lười tập', 'Ăn kiêng'];
const THEMES = ['Kể lịch tập cá nhân', 'Hỏi cách duy trì thói quen', 'Than lười, xin động lực', 'Hỏi bài tập cho người mới',
  'Khoe kết quả của mình', 'Hỏi về ăn uống', 'Rủ nhau tập cùng', 'Hỏi app tên gì'];
const SIZES = [900, 420, 1600, 650, 300, 1200, 520, 2200, 380];

// mulberry32: a tiny seeded generator, enough for stable sample numbers.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const lognormal = (r, sigma) => Math.exp(sigma * (r() + r() + r() + r() - 2) * 1.7);
// Six in the morning, Vietnam time, strictly after the given instant.
const nextSix = (t) => { const d = Math.floor((t - VN - 6 * HOUR) / DAY) + 1; return d * DAY + 6 * HOUR + VN; };
const code = (handle) => String(handle).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'acc';

export function demoAnalytics(team, now = Date.now()) {
  const accounts = team.accounts.filter((a) => team.members.some((m) => m.id === a.member_id && m.is_demo));
  const data = { posts: [], observations: [], versions: [], installs: [], cards: [], runs: [], keywords: [] };
  const todaySix = nextSix(now) - DAY;
  for (const [j, account] of accounts.entries()) {
    const r = rng(1000 + j * 97);
    const creative = account.kind === 'creative';
    const size = SIZES[j % SIZES.length] * (creative ? 0.7 : 1);
    for (let d = 49; d >= 1; d--) {
      if (r() < 0.16) continue; // a day without a post
      const i = 49 - d;
      const id = `sample-${j}-${i}`;
      const published = todaySix - d * DAY + (13 + r() * 2.5) * HOUR; // between 19:00 and 21:30 VN, d days ago
      const engine = r() < 0.55 ? 'ask' : 'line';
      const pull = r() < 0.6 ? 'strong' : 'some';
      const fit = r() < 0.7 ? 'native' : r() < 0.6 ? 'adjacent' : 'reach';
      const card = { id, op: OPS[(i + j) % OPS.length], pull, fit, engine };
      if (!creative) { data.cards.push(card); data.keywords.push({ card_id: id, keyword: KEYWORDS[(i * 7 + j) % KEYWORDS.length] }); }
      const viral = (i + j * 5) % 23 === 11 ? 6 + r() * 9 : 1;
      const v7 = Math.round(size * lognormal(r, 0.45) * (pull === 'strong' ? 1.25 : 1) * (fit === 'reach' ? 1.4 : 1) * viral);
      const tau = 1.2 + r() * 1.4;
      const likeRate = (engine === 'line' ? 0.045 : 0.03) * (0.7 + r() * 0.6);
      const replyRate = (engine === 'ask' ? 0.018 : 0.007) * (0.7 + r() * 0.6);
      const ct = `${code(account.handle)}_${creative ? 's' : ''}${i.toString(36).padStart(4, '0')}`;
      const match = creative ? 'creative' : r() < 0.1 ? 'text' : 'ct';
      data.posts.push({ id, account_id: account.id, card_id: creative ? null : id, ct: match === 'text' ? null : ct, published_at: new Date(published).toISOString(),
        match_method: match, source_url: null });
      const themes = [pick(r, THEMES), pick(r, THEMES), pick(r, THEMES)].filter((t, k, all) => all.indexOf(t) === k);
      const shape = (t) => (1 - Math.exp(-t / tau)) / (1 - Math.exp(-7 / tau));
      for (let t = nextSix(published); t <= now; t += DAY) {
        const age = (t - published) / DAY;
        const views = Math.round(v7 * (age <= 7 ? shape(age) : 1 + 0.03 * (age - 7)));
        const likes = Math.floor(views * likeRate), other = Math.floor(views * replyRate);
        const sample = Math.min(12, other);
        data.observations.push({ post_id: id, captured_at: new Date(t).toISOString(), views, likes, replies: other + 2, other_replies: other,
          reposts: Math.floor(views * 0.004), quotes: Math.floor(views * 0.0012), reply_sample_size: sample >= 3 ? sample : 0, model: sample >= 3 ? 'Ví dụ minh họa' : null,
          reply_themes: sample >= 3 ? themes.map((theme, k) => ({ theme, count: Math.max(1, Math.round(sample * [0.5, 0.3, 0.2][k])) })) : [] });
      }
      const changed = r() < 0.3 ? [r() < 0.7 ? 'op' : 'r1'] : [];
      data.versions.push({ post_id: id, captured_at: new Date(nextSix(published)).toISOString(), op: card.op + (changed.includes('op') ? '\nMình bắt đầu với 10 phút thôi.' : ''),
        r1: changed.includes('r1') ? 'Tối nay tập xong mới ăn.' : 'Một ví dụ để xem trước giao diện.', r2: null, changed_parts: changed,
        copied_text: { op: card.op, r1: 'Một ví dụ để xem trước giao diện.' }, writer_text: { op: card.op, r1: 'Một ví dụ để xem trước giao diện.' } });
      if (match !== 'text' && r() < 0.28 && published + 3 * DAY <= now) {
        data.installs.push({ ct, installs: Math.max(1, Math.round((pull === 'strong' ? 3 : 1.5) * viral * (0.5 + r()))), captured_at: new Date(nextSix(published + 2 * DAY)).toISOString() });
      }
    }
  }
  data.runs.push({ id: 'sample-run', started_at: new Date(todaySix - 20 * 60000).toISOString(), finished_at: new Date(todaySix).toISOString(), status: 'complete', accounts_checked: accounts.map((a) => a.id), detail: 'Số liệu mẫu' });
  return data;
}
