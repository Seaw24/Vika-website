// One shared pool (Nam, 2026-10-27): every member picks her cards in Kho bài and holds at most 3 she has not posted.
// A seeding account adds one post to her daily target and brings no card. These build what she reads about it.

// The toast after she adds an account.
export function addedToast(handle, kind) {
  return kind === 'card' ? `Đã thêm @${handle}. Mỗi ngày bạn đăng thêm một bài, chọn trong Kho bài.` : `Đã thêm @${handle}.`;
}

// Nhóm's warning when the pool holds less than a week of posts: one card a day per active seeding account.
export function poolNotice(size, seeding) {
  if (!seeding || size >= seeding * 7) return null;
  const days = Math.floor(size / seeding);
  return size ? `Kho chung còn ${size} bài, đủ cho khoảng ${days} ngày. Admin cần thêm bài.` : 'Kho chung đã hết bài. Admin cần thêm bài.';
}
