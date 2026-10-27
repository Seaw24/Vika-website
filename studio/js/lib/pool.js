// One shared pool (Nam, 2026-10-27; migration card_pool): each member holds one card per active seeding account,
// and next_cards() deals her the top card of the pool when she posts one. These build what she reads about it.

// Hôm nay's headline and lede when she has no card to post, or null to keep the usual ones.
export function emptyMessage({ seeding, short }) {
  if (!seeding) return {
    headline: 'Thêm một tài khoản seeding để nhận bài.',
    lede: 'Vào Cài đặt, bấm Thêm tài khoản Threads và chọn Có, seeding. Mỗi tài khoản seeding nhận ngay một bài từ kho chung.',
  };
  if (short > 0) return {
    headline: 'Đang chờ admin thêm bài cho bạn.',
    lede: 'Kho chung đã hết bài. Khi admin thêm bài, bài sẽ tự hiện ở đây.',
  };
  return null;
}

// The toast after she adds a seeding account. A failed deal (null) still confirms the account.
export function addedToast(handle, result) {
  const dealt = result?.dealt ?? 0;
  const short = result?.short ?? 0;
  if (dealt) return `Đã thêm @${handle} và ${dealt} bài từ kho chung.`;
  if (short) return `Đã thêm @${handle}. Kho chung đã hết bài, đang chờ admin thêm.`;
  return `Đã thêm @${handle}.`;
}

// Nhóm's warning when the pool holds less than a week of posts: one card a day per active seeding account.
export function poolNotice(size, seeding) {
  if (!seeding || size >= seeding * 7) return null;
  const days = Math.floor(size / seeding);
  return size ? `Kho chung còn ${size} bài, đủ cho khoảng ${days} ngày. Admin cần thêm bài.` : 'Kho chung đã hết bài. Admin cần thêm bài.';
}
