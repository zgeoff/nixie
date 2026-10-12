import type { ActivityItem } from './build-activity';

// nixie works from when you send a message until its reply arrives or a step fails or stops, and
// through each step from its start to its end. A message that failed to send waits on you.
export function isWorking(activity: readonly ActivityItem[], hasPendingSend: boolean): boolean {
  return (
    hasPendingSend ||
    activity.some((item) => item.kind === 'step' && item.status === 'running') ||
    hasUnansweredMessage(activity)
  );
}

// Reads back from the end past the steps that finished, to the item that settles the wait.
function hasUnansweredMessage(activity: readonly ActivityItem[]): boolean {
  const settling = activity.findLast((item) => item.kind === 'message' || item.status !== 'done');

  return settling?.kind === 'message' && settling.record.kind === 'owner_message';
}
