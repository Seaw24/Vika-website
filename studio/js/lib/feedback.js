import { postingState } from './week.js';

export const SKIP_REASONS = [
  ['wrong_readers', 'Không hợp người đọc'], ['no_interest', 'Không ai quan tâm'],
  ['app_risk', 'Có thể hại app'], ['similar', 'Giống bài khác'], ['not_needed', 'Chỉ là không cần'],
];

export function pendingQuestions(questions, events, memberId) {
  const done = new Set(events.filter((e) => ['answered', 'question_dismissed'].includes(e.type))
    .map((e) => e.payload?.question_id).filter(Boolean));
  return questions.filter((q) => q.member_id === memberId && !done.has(q.id))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

// Cards the Sunday review asks about: not confirmed, not claimed as posted, not already skipped.
export function reviewable(assignments, events, posts) {
  const states = postingState(events, posts);
  const skipped = new Set(events.filter((e) => e.type === 'skipped').map((e) => e.assignment_id));
  return assignments.filter((a) => !skipped.has(a.id) && !['claimed', 'confirmed'].includes(states.get(a.id)?.status));
}
