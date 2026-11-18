import type { ActivityItem, SentFileActivity, StepActivity } from './build-activity';

// The files a step sent show under its last reply, and under the step when it made no reply. The
// map keys are indexes into the activity.
export function buildSentFilePlacement(
  activity: readonly ActivityItem[],
): ReadonlyMap<number, readonly SentFileActivity[]> {
  const placement = new Map<number, readonly SentFileActivity[]>();

  activity.forEach((item, index) => {
    if (item.kind === 'step' && item.sentFiles !== undefined) {
      const at = findLastReply(activity, index, item) ?? index;

      placement.set(at, [...(placement.get(at) ?? []), ...item.sentFiles]);
    }
  });

  return placement;
}

function findLastReply(
  activity: readonly ActivityItem[],
  stepIndex: number,
  step: StepActivity,
): number | null {
  const first = step.records[0]?.sequence ?? step.key;
  const last = step.records.at(-1)?.sequence ?? first;

  const found = activity.findLastIndex(
    (item, index) =>
      index > stepIndex &&
      item.kind === 'message' &&
      item.record.kind === 'model.reply' &&
      item.record.sequence >= first &&
      item.record.sequence <= last,
  );

  return found === -1 ? null : found;
}
