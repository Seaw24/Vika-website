export const REASONS = [
  ['not_natural', 'Nghe chưa giống người thật nói'],
  ['weak_opener', 'Câu mở đầu chưa cuốn'],
  ['too_long', 'Dài quá'],
  ['wrong_or_unclear', 'Ý sai hoặc khó hiểu'],
  ['added_own_story', 'Thêm chuyện của mình cho thật'],
  ['odd_word', 'Có từ nghe lạ'],
  ['other', 'Khác'],
];

export const NEXT_TIME = [
  ['always', 'Có, luôn vậy'],
  ['this_post', 'Chỉ bài này'],
  ['unsure', 'Chưa chắc'],
];

export const PART_LABEL = { op: 'Bài đăng', r1: 'Bình luận 1', r2: 'Bình luận 2', runner_up: 'Bản thay thế' };
export const ENGINE_LABEL = { ask: 'Hỏi để mọi người trả lời', line: 'Một câu để thích và chia sẻ' };
export const PULL_LABEL = { strong: 'Dự đoán: lan mạnh', some: 'Dự đoán: lan vừa' };

export const labelFor = (list, code) => list.find(([c]) => c === code)?.[1] ?? code;

export const normalizeText = (text) =>
  String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/\s+$/, '')).join('\n').trim();

export const isEdited = (original, current) => normalizeText(original) !== normalizeText(current);

export function buildAnswer({ editClientId, part, reasons, words, nextTime }) {
  const known = new Set(REASONS.map(([code]) => code));
  const cleanReasons = [...new Set(reasons ?? [])].filter((r) => known.has(r));
  const cleanWords = String(words ?? '').trim().slice(0, 4000);
  const cleanNext = NEXT_TIME.some(([code]) => code === nextTime) ? nextTime : null;
  if (!cleanReasons.length && !cleanWords && !cleanNext) return null;
  return { kind: 'edit', edit_client_id: editClientId, part, reasons: cleanReasons, words: cleanWords, next_time: cleanNext };
}
