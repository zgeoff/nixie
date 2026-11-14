import type { MomentWeekCount } from './read-week-count';

// The count speaks to the conversation, so "you" is the conversation and every other thread that
// kept a moment is another of its tasks.
export function renderWeekCount(count: MomentWeekCount, ownerName: string | null): string {
  const keepers = [
    ...(count.byConversation > 0 ? [`${String(count.byConversation)} by you`] : []),
    ...(count.byTasks > 0
      ? [
          `${String(count.byTasks)} by ${count.byTasks === 1 ? 'another of your tasks' : 'your other tasks'}`,
        ]
      : []),
    ...(count.byOwner > 0 ? [`${String(count.byOwner)} by ${ownerName ?? 'the owner'}`] : []),
  ];

  const split = keepers.length === 0 ? '' : ` (${keepers.join(', ')})`;

  const waiting =
    count.waitingForReflection === 0
      ? ''
      : ` ${String(count.waitingForReflection)} ${count.waitingForReflection === 1 ? 'is' : 'are'} waiting for a reflection.`;

  return `Moments kept this week: ${String(count.total)}${split}.${waiting}`;
}
