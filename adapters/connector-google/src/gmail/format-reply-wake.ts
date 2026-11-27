import { formatDurationText } from '@heynixie/connections';

// The card line of a send's reply rule: the length the call names, `off`, or the deployment's reply
// expiry when the call names none.
export function formatReplyWake(replyWake: string | undefined, defaultMs: number): string {
  if (replyWake === 'off') {
    return 'off: no reply rule';
  }

  return replyWake ?? `${formatDurationText(defaultMs)}, the default`;
}
