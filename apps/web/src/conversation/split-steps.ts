import type { ActivityItem, StepActivity } from './build-activity';
import { buildStep } from './build-step';
import type { LiveRecord } from './use-live-records';

// A message inside a step splits it into one segment per run of records between messages. The header
// stays on the first segment, and the status, duration, error and the notices of places on the last. A step that ended in
// an error or an interruption voids the replies inside it, which covers a crash with no void record.
export function splitSteps(whole: readonly ActivityItem[]): readonly ActivityItem[] {
  const items = voidRepliesOfPartialSteps(whole);

  const moved = new Set<number>();

  const result: ActivityItem[] = [];

  items.forEach((item, index) => {
    if (moved.has(index)) {
      return;
    }

    if (item.kind !== 'step') {
      result.push(item);

      return;
    }

    const inside = collectMessagesInside(items, index, item);

    for (const found of inside) {
      moved.add(found.index);
    }

    result.push(
      ...splitStep(
        item,
        inside.map((found) => markVoidedReply(found.item, item)),
      ),
    );
  });

  return result;
}

// A page that starts mid-step holds the step's replies before the item its end record makes, so
// they sit ahead of it with no step_started record to place them.
function voidRepliesOfPartialSteps(items: readonly ActivityItem[]): readonly ActivityItem[] {
  const result = [...items];
  let from = 0;

  items.forEach((item, index) => {
    if (item.kind !== 'step') {
      return;
    }

    if (!item.records.some((record) => record.kind === 'task.step_started')) {
      for (let at = from; at < index; at++) {
        const earlier = result[at];

        if (earlier?.kind === 'message') {
          result[at] = markVoidedReply(earlier, item);
        }
      }
    }

    from = index + 1;
  });

  return result;
}

const voidReasons: Readonly<Record<string, 'attempt_failed' | 'attempt_lost'>> = {
  failed: 'attempt_failed',
  interrupted: 'attempt_lost',
};

type MessageItem = Extract<ActivityItem, { readonly kind: 'message' }>;

function markVoidedReply(item: MessageItem, step: StepActivity): MessageItem {
  const voidReason = voidReasons[step.status];
  const message = item.record.message;

  if (voidReason === undefined || item.record.kind !== 'model.reply' || message === undefined) {
    return item;
  }

  return {
    kind: 'message',
    record: {
      ...item.record,
      message: { ...message, isVoided: true, voidReason: message.voidReason ?? voidReason },
    },
    ...(step.cause === undefined ? {} : { cause: step.cause }),
  };
}

function collectMessagesInside(
  items: readonly ActivityItem[],
  stepIndex: number,
  step: StepActivity,
): readonly { readonly index: number; readonly item: MessageItem }[] {
  const first = step.records[0]?.sequence ?? step.key;
  const last = step.records.at(-1)?.sequence ?? first;

  return items.flatMap((item, index) =>
    index > stepIndex &&
    item.kind === 'message' &&
    item.record.sequence > first &&
    item.record.sequence < last
      ? [{ index, item }]
      : [],
  );
}

function splitStep(step: StepActivity, messages: readonly MessageItem[]): readonly ActivityItem[] {
  if (messages.length === 0) {
    return [step];
  }

  const grouped = groupByMessage(step.records, messages);
  const groups = isTailEmpty(step, grouped) ? mergeTail(grouped) : grouped;
  const built = buildSegments(step, groups);
  const result: ActivityItem[] = [];
  let next = 0;

  built.forEach((segment, index) => {
    const following = groups[index + 1];
    const end = following === undefined ? messages.length : following.cutCount;

    result.push(
      buildSegment(step, segment, index, following === undefined),
      ...messages.slice(next, end),
    );

    next = end;
  });

  return result;
}

interface MessageGroup {
  // how many of the messages come before this group's records
  readonly cutCount: number;
  readonly records: readonly LiveRecord[];
}

function groupByMessage(
  records: readonly LiveRecord[],
  messages: readonly MessageItem[],
): MessageGroup[] {
  const groups = new Map<number, LiveRecord[]>();

  for (const record of records) {
    const cutCount = messages.filter((message) => message.record.sequence < record.sequence).length;

    groups.set(cutCount, [...(groups.get(cutCount) ?? []), record]);
  }

  return [...groups].map(([cutCount, grouped]) => ({ cutCount, records: grouped }));
}

// The records after the last message hold no content of their own when the step ends there. They
// stay with the segment before the message, so a reply at the end of a step leaves it as it was.
function isTailEmpty(step: StepActivity, groups: readonly MessageGroup[]): boolean {
  return (
    groups.length > 1 && !hasContent(buildSegments(step, groups).at(-1) ?? buildStep([], 'done'))
  );
}

function hasContent(segment: StepActivity): boolean {
  return (
    segment.calls.length > 0 ||
    segment.workers !== undefined ||
    segment.memories !== undefined ||
    segment.compactions !== undefined ||
    segment.summaries !== undefined
  );
}

function buildSegments(step: StepActivity, groups: readonly MessageGroup[]): StepActivity[] {
  const seen = new Set<string>();

  return groups.map((group) => {
    const owned = new Set<string>();

    for (const record of group.records) {
      const callID = record.toolCall?.callID;

      if (callID !== undefined && !seen.has(callID)) {
        owned.add(callID);
        seen.add(callID);
      }
    }

    return buildStep(group.records, 'done', step.records, owned);
  });
}

function mergeTail(groups: readonly MessageGroup[]): readonly MessageGroup[] {
  const last = groups.at(-1);
  const before = groups.at(-2);

  return last === undefined || before === undefined
    ? groups
    : [
        ...groups.slice(0, -2),
        { cutCount: before.cutCount, records: [...before.records, ...last.records] },
      ];
}

function buildSegment(
  step: StepActivity,
  segment: StepActivity,
  index: number,
  isLast: boolean,
): StepActivity {
  const {
    durationMs: _duration,
    cause: _cause,
    error: _error,
    placeActs: _placeActs,
    placeNarrowings: _placeNarrowings,
    ...own
  } = segment;

  return {
    ...own,
    ...(step.taskID === undefined ? {} : { taskID: step.taskID }),
    ...(step.stepKey === undefined ? {} : { stepKey: step.stepKey }),
    ...(index === 0 ? {} : { isContinued: true as const }),
    ...(isLast
      ? {
          ...(step.placeActs === undefined ? {} : { placeActs: step.placeActs }),
          ...(step.placeNarrowings === undefined ? {} : { placeNarrowings: step.placeNarrowings }),
          status: step.status,
          ...(step.durationMs === undefined ? {} : { durationMs: step.durationMs }),
          ...(step.cause === undefined ? {} : { cause: step.cause }),
          ...(step.error === undefined ? {} : { error: step.error }),
        }
      : {}),
  };
}
