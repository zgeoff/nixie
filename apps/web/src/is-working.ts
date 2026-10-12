import type { ActivityItem } from './build-activity';

// nixie works on a reply from when you send a message until the reply arrives, and through a step
// from its start to its end. A message that failed to send waits on you, not on nixie.
export function isWorking(activity: readonly ActivityItem[], hasPendingSend: boolean): boolean {
  const last = activity.at(-1);

  return (
    hasPendingSend ||
    (last?.kind === 'message' && last.record.kind === 'owner_message') ||
    activity.some((item) => item.kind === 'step' && item.status === 'running')
  );
}
