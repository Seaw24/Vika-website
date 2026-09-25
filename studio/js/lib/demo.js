import { DAY } from './stats.js';

// This data only exists in browser memory after an explicit request to preview it.
// It is never written to Supabase or included in a collection/learning export.
export function demoAnalytics(team, now = Date.now()) {
  const accounts = team.accounts.filter((a) => team.members.some((m) => m.id === a.member_id && m.is_demo));
  const data = { posts: [], observations: [], versions: [], installs: [], cards: [], runs: [], keywords: [] };
  for (const [j, account] of accounts.entries()) {
    for (let i = 0; i < 24; i++) {
      const id = `sample-${j}-${i}`;
      const published = now - (49 - i * 2) * DAY;
      const creative = account.kind === 'creative';
      const card = { id, op: ['Hôm nay bạn tập lúc mấy giờ?', 'Một buổi tập ngắn vẫn là một buổi tập.', 'Bạn giữ thói quen tập bằng cách nào?'][i % 3],
        pull: i % 3 ? 'strong' : 'some', fit: i % 4 ? 'native' : 'adjacent', engine: i % 2 ? 'ask' : 'line' };
      data.cards.push(card);
      data.keywords.push({ card_id: id, keyword: ['Tập ở nhà', 'Thói quen', 'Thời gian'][i % 3] });
      const p = { id, account_id: account.id, card_id: creative ? null : id, ct: `sample${j}_${i}`, published_at: new Date(published).toISOString(), match_method: creative ? 'creative' : 'ct' };
      data.posts.push(p);
      const changed = i % 4 === 0;
      data.versions.push({ post_id: id, captured_at: new Date(published + DAY).toISOString(), op: card.op + (changed ? '\nMình bắt đầu với 10 phút.' : ''),
        r1: 'Một ví dụ để xem trước giao diện.', r2: null, changed_parts: changed ? ['op'] : [], copied_text: { op: card.op }, writer_text: { op: card.op } });
      for (const day of [1, 3, 7]) {
        if (published + day * DAY > now) continue;
        const views = Math.round((90 + j * 70 + ((i * 137 + j * 23) % 1900)) * Math.min(1, day / 7) * (i === 17 ? 8 : 1));
        data.observations.push({ post_id: id, captured_at: new Date(published + day * DAY).toISOString(), views,
          likes: Math.round(views / 30), replies: Math.round(views / 70) + 2, other_replies: Math.round(views / 70),
          reposts: Math.round(views / 140), quotes: Math.round(views / 250), reply_sample_size: 8,
          model: 'Ví dụ minh họa', reply_themes: [{ theme: 'Kể lịch tập cá nhân', count: 5 }, { theme: 'Hỏi cách duy trì thói quen', count: 3 }] });
      }
      if (i % 6 === 0) data.installs.push({ ct: p.ct, installs: 5 + j, captured_at: new Date(published + DAY).toISOString() });
    }
  }
  return data;
}
