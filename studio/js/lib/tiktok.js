// The TikTok tab (Nam, 2026-10-09): read-Threads videos wait here until a member in Vietnam posts them.
// The desktop removes a posted video's file after three days, so a mark can be taken back only inside that window.
export const KEEP_DAYS = 3;
const DAY = 86400000;

// Bỏ qua (Nam, 2026-10-09): she says why she sets a video aside; at least one reason or a few words.
export const SKIP_REASONS = [
  ['broken', 'Video bị lỗi'], ['wrong_viewers', 'Không hợp người xem'], ['app_risk', 'Có thể hại app'],
  ['similar', 'Giống video khác'], ['not_needed', 'Chỉ là không cần'],
];
export const skipLabels = (video) => [...(video.skip_reasons ?? []).map((r) => SKIP_REASONS.find(([code]) => code === r)?.[1]).filter(Boolean), video.skip_words].filter(Boolean);

// Waiting videos go out oldest first; posted and skipped ones list newest first.
export function splitQueue(videos) {
  const newest = (key) => (a, b) => Date.parse(b[key]) - Date.parse(a[key]);
  const waiting = videos.filter((v) => !v.posted_at && !v.skipped_at).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.slug.localeCompare(b.slug));
  const posted = videos.filter((v) => v.posted_at).sort(newest('posted_at'));
  const skipped = videos.filter((v) => v.skipped_at && !v.posted_at).sort(newest('skipped_at'));
  return { waiting, posted, skipped };
}

// The video on the big card: the one she picked from the queue while it still waits, otherwise the oldest.
export function nextVideo(waiting, pickedId) {
  return waiting.find((v) => v.id === pickedId) ?? waiting[0] ?? null;
}

export function canTakeBack(video, memberId, now = Date.now()) {
  return Boolean(video.posted_at) && video.posted_by === memberId && !video.file_removed_at
    && now - Date.parse(video.posted_at) < KEEP_DAYS * DAY;
}

// TikTok's share button copies text around the link ("Xem video này ... https://vt.tiktok.com/ZS.../"), so take the link out of it.
export function tiktokUrl(text) {
  const match = String(text ?? '').match(/https:\/\/(?:[a-z]+\.)?tiktok\.com\/[^\s"'<>]*/i);
  return match ? match[0].replace(/[),.;!?]+$/, '') : null;
}

export function durationLabel(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '';
  const s = Math.round(Number(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function sizeLabel(bytes) {
  if (!bytes) return '';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(bytes / 1048576)} MB`;
}

// Phones hand the file to the share sheet (Lưu video, or straight to TikTok); a computer downloads it.
export function deliveryMode({ coarse, canShareFiles }) {
  return coarse && canShareFiles ? 'share' : 'download';
}

export const fileName = (video) => `vika-${video.slug}.mp4`;

// The feed (Nam, 2026-10-11): the video on screen and its two neighbours hold a source, the rest drop it, so a phone
// never keeps every file.
export function nearby(active, length) {
  return [active - 1, active, active + 1].filter((i) => i >= 0 && i < length);
}

// When a video leaves the feed, the one under it comes up; at the end, the one above it.
export function afterLeave(ids, leavingId, activeId) {
  const rest = ids.filter((id) => id !== leavingId);
  if (!rest.length) return null;
  if (leavingId !== activeId) return rest.includes(activeId) ? activeId : rest[0];
  return rest[Math.min(ids.indexOf(leavingId), rest.length - 1)];
}

export const positionLabel = (position, total, seconds) =>
  [total > 1 ? `Video ${position} / ${total}` : 'Video cuối', durationLabel(seconds)].filter(Boolean).join(' · ');

// Đã đăng: her own post with no TikTok link yet carries a "Thêm link" badge and a Dán link button.
export const needsLink = (video, memberId) => Boolean(video.posted_at) && video.posted_by === memberId && !video.post_url;

// The name on a cover: who posted the video, or who set it aside.
export function coverName(video, members) {
  const id = video.posted_at ? video.posted_by : video.skipped_by;
  return members.find((m) => m.id === id)?.name ?? 'Thành viên';
}

// A phone browser keeps its own bars; Studio from the Home Screen is full screen. The hint shows in a phone browser
// until she dismisses it, and never inside the Home Screen app.
export const showHomeHint = ({ coarse, standalone, dismissed }) => coarse && !standalone && !dismissed;
export const homeSteps = (userAgent) => (/iPhone|iPad|iPod/.test(userAgent)
  ? 'Bấm Chia sẻ rồi chọn Thêm vào MH chính.'
  : 'Mở menu ⋮ của trình duyệt rồi chọn Thêm vào màn hình chính.');
