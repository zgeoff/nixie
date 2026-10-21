import type { ActivityItem } from './build-activity';

export function isWorking(activity: readonly ActivityItem[], hasPendingSend: boolean): boolean {
  return (
    hasPendingSend ||
    activity.some((item) => item.kind === 'step' && item.status === 'running') ||
    hasUnansweredMessage(activity)
  );
}

function hasUnansweredMessage(activity: readonly ActivityItem[]): boolean {
  const settling = activity.findLast((item) => item.kind !== 'step' || item.status !== 'done');

  return settling?.kind === 'message' && settling.record.kind === 'owner_message';
}
