import type { ActivityItem } from '../conversation/build-activity';
import type { LiveRecord } from '../conversation/use-live-records';

export type RemovalRecord = LiveRecord & { readonly removal: NonNullable<LiveRecord['removal']> };

// A removal shows under the last item of the turn that its record was written in: the items from
// the owner's message before it up to the next owner message.
export function buildRemovalPlacement(
  activity: readonly ActivityItem[],
  records: readonly LiveRecord[],
): ReadonlyMap<number, readonly RemovalRecord[]> {
  const placement = new Map<number, RemovalRecord[]>();

  for (const record of records) {
    if (record.removal === undefined) {
      continue;
    }

    const index = findTurnEnd(activity, record.sequence);

    if (index !== null) {
      placement.set(index, [
        ...(placement.get(index) ?? []),
        { ...record, removal: record.removal },
      ]);
    }
  }

  return placement;
}

function findTurnEnd(activity: readonly ActivityItem[], sequence: number): number | null {
  const start = activity.findLastIndex(
    (item) => isOwnerMessage(item) && getFirstSequence(item) <= sequence,
  );

  const next = activity.findIndex((item, index) => index > start && isOwnerMessage(item));

  if (start === -1) {
    const last = activity.findLastIndex((item) => getFirstSequence(item) <= sequence);

    return last === -1 ? null : last;
  }

  return next === -1 ? activity.length - 1 : next - 1;
}

function isOwnerMessage(item: ActivityItem): boolean {
  return item.kind === 'message' && item.record.kind === 'owner_message';
}

function getFirstSequence(item: ActivityItem): number {
  return item.kind === 'step' ? item.key : item.record.sequence;
}
