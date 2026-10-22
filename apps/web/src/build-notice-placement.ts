import type { ActivityItem } from './build-activity';
import type { MemoryNotice } from './types';

export function buildNoticePlacement(
  activity: readonly ActivityItem[],
  notices: readonly MemoryNotice[],
): ReadonlyMap<number, readonly MemoryNotice[]> {
  const placement = new Map<number, MemoryNotice[]>();

  for (const notice of notices) {
    const index = findTurnEnd(activity, notice) ?? findLastBefore(activity, notice);

    if (index !== null) {
      placement.set(index, [...(placement.get(index) ?? []), notice]);
    }
  }

  return placement;
}

function findTurnEnd(activity: readonly ActivityItem[], notice: MemoryNotice): number | null {
  if (notice.messageSequence === null) {
    return null;
  }

  const start = activity.findIndex(
    (item) => isOwnerMessage(item) && getFirstSequence(item) === notice.messageSequence,
  );

  if (start === -1) {
    return null;
  }

  const next = activity.findIndex((item, index) => index > start && isOwnerMessage(item));

  return next === -1 ? activity.length - 1 : next - 1;
}

function isOwnerMessage(item: ActivityItem): boolean {
  return item.kind === 'message' && item.record.kind === 'owner_message';
}

function getFirstSequence(item: ActivityItem): number {
  return item.kind === 'step' ? item.key : item.record.sequence;
}

function findLastBefore(activity: readonly ActivityItem[], notice: MemoryNotice): number | null {
  const newest = Math.max(...notice.entries.map((entry) => entry.sequence));
  const index = activity.findLastIndex((item) => getFirstSequence(item) <= newest);

  return index === -1 ? null : index;
}
