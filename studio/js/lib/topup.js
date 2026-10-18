// Cards right away (Nam, 2026-10-17): a member is owed 7 cards per active seeding account in the newest week,
// and top_up_cards() deals them from the spare pool (migration card_top_up). These build what she reads about it.

// Hôm nay's headline and lede when she has no card to post, or null to keep the usual ones.
export function emptyMessage({ seeding, short }) {
  if (!seeding) return {
    headline: 'Thêm một tài khoản seeding để nhận bài.',
    lede: 'Vào Cài đặt, bấm Thêm tài khoản Threads và chọn Có, seeding. Mỗi tài khoản seeding nhận ngay 7 bài.',
  };
  if (short > 0) return {
    headline: 'Đang chờ admin thêm bài cho bạn.',
    lede: 'Kho bài dự trữ đã hết. Khi admin thêm bài, bài sẽ tự hiện ở đây.',
  };
  return null;
}

// The toast after she adds a seeding account. A failed top-up (null) still confirms the account.
export function addedToast(handle, result) {
  const dealt = result?.dealt ?? 0;
  const short = result?.short ?? 0;
  if (dealt && short) return `Đã thêm @${handle} và ${dealt} bài. Còn thiếu ${short} bài, đang chờ admin thêm.`;
  if (dealt) return `Đã thêm @${handle} và ${dealt} bài.`;
  if (short) return `Đã thêm @${handle}. Đang chờ admin thêm bài cho bạn.`;
  return `Đã thêm @${handle}.`;
}

// Nhóm's lines for the members who still wait, by name.
export function shortLines(rows, members) {
  return rows.map((r) => ({ name: members.find((m) => m.id === r.member_id)?.name, short: r.short }))
    .filter((r) => r.name && r.short > 0)
    .map((r) => `${r.name} chờ ${r.short} bài.`);
}
