import { formatEventTime } from '@heynixie/sessions';
import { connectionStatusText } from './connection-status-text';

// The time of a connection's last success, or the words that say it has none.
export function renderLastSuccess(lastSuccessAtMs: number | null, timeZone: string): string {
  return lastSuccessAtMs === null
    ? connectionStatusText.noSuccess
    : formatEventTime(lastSuccessAtMs, timeZone);
}
