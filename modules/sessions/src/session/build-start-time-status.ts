import { formatMessageTime } from '../message/format-message-time';
import type { StatusEntry } from './build-status-registry';

export function buildStartTimeStatus(): StatusEntry {
  return {
    name: 'started_at',
    read: (facts) =>
      Promise.resolve({
        value: facts.openedAt.toISOString(),
        text: `Session started: ${formatMessageTime(facts.openedAt, facts.zone, facts.times)}. Each message carries its own time.`,
      }),
  };
}
