// Kho chung as a feed (Nam, 2026-10-27): every member scrolls the whole pool and takes the card she wants to post.
// A card's content notes are one team thread on the card (Góp ý nội dung). A note never skips the card: it stays in
// the pool for the others. These are the parts Hôm nay and the card page share.

// Cards per chunk. The next chunk loads while she is still a screen or two above the end.
export const FEED_CHUNK = 12;
// Cards one member may hold unposted at once, so the pool stays open to the others.
export const HOLD_LIMIT = 3;

export const FEED_FILTERS = [['all', 'Tất cả'], ['ask', 'Hỏi'], ['line', 'Một câu'], ['strong', 'Lan mạnh'], ['talked', 'Có góp ý']];

export function matchesFilter(card, filter) {
  if (filter === 'talked') return (card.comments?.length ?? 0) > 0;
  return filter === 'all' || card.engine === filter || card.pull === filter;
}

// Quick tags on a note. Each one says what is wrong or right with the idea of the post, never with its words:
// the words are hers to edit on the card, and Kể lý do sửa asks why.
export const NOTE_TAGS = [
  ['vague', 'Ý mơ hồ'], ['wrong_readers', 'Không hợp người đọc'], ['no_interest', 'Không ai quan tâm'],
  ['app_risk', 'Có thể hại app'], ['similar', 'Giống bài khác'], ['good', 'Ý hay, nên đăng'],
];
export const tagLabel = (code) => NOTE_TAGS.find(([c]) => c === code)?.[1] ?? null;

// A note needs words or at least one tag.
export const noteReady = ({ body = '', tags = [] }) => body.trim().length > 0 || tags.length > 0;

// Newest last, deleted notes out.
export const liveNotes = (rows) => rows.filter((r) => !r.deleted_at)
  .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || String(a.id).localeCompare(String(b.id)));

const VN = 'Asia/Ho_Chi_Minh';
const dayMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: VN, day: 'numeric', month: 'numeric' });
export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  const days = Math.floor(s / 86400);
  if (days === 1) return 'hôm qua';
  if (days < 7) return `${days} ngày trước`;
  return dayMonth.format(new Date(iso));
}

// 2200 → "2,2K", 186 → "186".
export function shortCount(v) {
  if (v == null) return null;
  if (v < 1000) return String(v);
  const k = v / 1000;
  return `${(k >= 100 ? Math.round(k) : Math.round(k * 10) / 10).toString().replace('.', ',')}K`;
}

// What take_card() refused, in her words.
export function takeMessage(result) {
  switch (result?.error) {
    case 'taken': return `${result.by ?? 'Một bạn khác'} vừa lấy bài này. Chọn bài khác nhé.`;
    case 'limit': return `Bạn đang giữ ${HOLD_LIMIT} bài. Đăng hoặc trả một bài về kho rồi lấy thêm.`;
    default: return 'Chưa lấy được bài. Thử lại nhé.';
  }
}
