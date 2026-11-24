import { formatIdleTime } from './format-idle-time';

export function buildIdleNote(idleMs: number): string {
  return ` The browser sleeps when it has been idle for ${formatIdleTime(idleMs)}, and every tab closes then: open the page again.`;
}
