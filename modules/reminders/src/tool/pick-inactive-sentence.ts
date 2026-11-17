import type { FoundReminder } from '../reminder/read-reminder-by-short-id';

export function pickInactiveSentence(found: FoundReminder): string | null {
  if (found.state === 'cancelled') {
    return 'That reminder was cancelled, so it cannot change.';
  }

  return found.state === 'fired'
    ? 'That one-time reminder already fired, so it cannot change.'
    : null;
}
