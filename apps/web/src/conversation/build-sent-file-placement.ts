import type { ActivityItem, SentFileActivity } from './build-activity';

// The files a step sent show under its last reply, and under the step when it made no reply. The
// map keys are indexes into the activity.
export function buildSentFilePlacement(
  activity: readonly ActivityItem[],
): ReadonlyMap<number, readonly SentFileActivity[]> {
  const placement = new Map<number, readonly SentFileActivity[]>();

  activity.forEach((item, index) => {
    if (item.kind === 'step' && item.sentFiles !== undefined) {
      const at = findLastReply(activity, index) ?? index;

      placement.set(at, [...(placement.get(at) ?? []), ...item.sentFiles]);
    }
  });

  return placement;
}

function findLastReply(activity: readonly ActivityItem[], stepIndex: number): number | null {
  const next = activity.findIndex((item, index) => index > stepIndex && item.kind === 'step');
  const end = next === -1 ? activity.length : next;

  const found = activity.findLastIndex(
    (item, index) =>
      index > stepIndex &&
      index < end &&
      item.kind === 'message' &&
      item.record.kind === 'model.reply' &&
      item.record.message?.isVoided !== true,
  );

  return found === -1 ? null : found;
}
