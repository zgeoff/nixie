import type { LiveTopic } from '@heynixie/contract';

export const changedEvent = 'changed';

// What writer.commits dispatches beside the plain commit event. The commit event wakes record
// readers, and this one wakes only the live streams.
export function createChangedEvent(
  topics: readonly LiveTopic[],
): CustomEvent<readonly LiveTopic[]> {
  return new CustomEvent(changedEvent, { detail: topics });
}
