import type { StatusEntry } from './build-status-registry';
import { formatMessageTime } from './format-message-time';

// The status entry for the time the session started, labelled as the start and never as the time
// now, because each input that starts a turn carries its own stamp.
export function buildStartTimeStatus(): StatusEntry {
  return {
    name: 'started_at',
    read: (facts) =>
      Promise.resolve({
        value: facts.openedAt.toISOString(),
        text: `Session started: ${formatMessageTime(facts.openedAt, null, facts.times)}. Each message carries its own time.`,
      }),
  };
}
