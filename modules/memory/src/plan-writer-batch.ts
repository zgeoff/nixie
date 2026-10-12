import type { WriterConfig } from './writer-config-schema';
import type { BatchBounds, BatchMode } from './writer-types';

// One conversation record after the cursor, as the planner sees it: whether it is your message,
// its size, and when the writer learned it arrived, or null for a record from before the writer
// watched, such as the catch-up's.
interface PlannedMessage {
  readonly sequence: number;
  readonly isOwner: boolean;
  readonly tokens: number;
  readonly arrivedAt: number | null;
}

export interface BatchPlanInput {
  readonly cursor: number;

  // the sequence at which memory started: records up to it are the catch-up's
  readonly startSequence: number;

  // the conversation's records after the cursor, oldest first
  readonly messages: readonly PlannedMessage[];
  readonly now: number;
  readonly lastBatchAt: number | null;
  readonly config: WriterConfig;
}

export type BatchPlan =
  | { readonly kind: 'batch'; readonly bounds: BatchBounds; readonly mode: BatchMode }

  // nothing is due: wake at wakeAt, or on the next message when wakeAt is null
  | { readonly kind: 'wait'; readonly wakeAt: number | null };

// Plans the writer's next batch. A full batch is due at once; fewer of your messages wait for the
// idle or age trigger, and a message from before the writer watched has waited long enough. A
// batch keeps to the pace limit and stops early at its token budget.
export function planWriterBatch(input: BatchPlanInput): BatchPlan {
  const owners = input.messages.filter((message) => message.isOwner);
  const catchUpEnd = planCatchUpEnd(input, owners);

  if (catchUpEnd !== null) {
    return catchUpEnd;
  }
  if (owners.length === 0) {
    return { kind: 'wait', wakeAt: null };
  }
  const earliest = planEarliestBatch(input, owners);

  if (input.now < earliest) {
    return { kind: 'wait', wakeAt: earliest };
  }
  return {
    kind: 'batch',
    bounds: { start: input.cursor, end: planBatchEnd(input) },
    mode: input.cursor < input.startSequence ? 'catch_up' : 'live',
  };
}

// the batch waits for its trigger and for the pace limit after the batch before it
function planEarliestBatch(input: BatchPlanInput, owners: readonly PlannedMessage[]): number {
  const dueAt = planDueTime(input, owners);
  const paceAt = input.lastBatchAt === null ? dueAt : input.lastBatchAt + input.config.paceMs;

  return Math.max(dueAt, paceAt);
}

// once nothing from before memory started waits, the catch-up ends with no model call
function planCatchUpEnd(
  input: BatchPlanInput,
  owners: readonly PlannedMessage[],
): BatchPlan | null {
  const isWaiting = owners.some((message) => message.sequence <= input.startSequence);

  if (input.cursor >= input.startSequence || isWaiting) {
    return null;
  }
  return {
    kind: 'batch',
    bounds: { start: input.cursor, end: input.startSequence },
    mode: 'catch_up',
  };
}

// a full batch is due at once; a short one when the conversation went idle or the oldest message
// reached the maximum age, whichever comes first
function planDueTime(input: BatchPlanInput, owners: readonly PlannedMessage[]): number {
  if (owners.length >= input.config.batchMessages) {
    return input.now;
  }
  const oldest = owners[0]?.arrivedAt ?? null;
  const latest = owners.at(-1)?.arrivedAt ?? null;

  if (oldest === null || latest === null) {
    return input.now;
  }
  return Math.min(latest + input.config.idleMs, oldest + input.config.maxAgeMs);
}

// One of your messages with the replies after it, or the replies before your first message.
interface TurnGroup {
  readonly hasOwner: boolean;
  readonly end: number;
  readonly tokens: number;
}

// The batch's last record: whole turns, up to the batch size, and a turn that would take the batch
// past its token budget starts the next batch. The first turn always goes in, however long. A
// catch-up batch stops at the sequence where memory started, so a live message gets its notice.
function planBatchEnd(input: BatchPlanInput): number {
  const config = input.config;
  const taken = { owners: 0, tokens: 0, end: input.cursor };

  for (const group of splitTurnGroups(collectBatchMessages(input))) {
    const isOverBudget = taken.owners > 0 && taken.tokens + group.tokens > config.batchTokens;

    if (group.hasOwner && (taken.owners >= config.batchMessages || isOverBudget)) {
      break;
    }
    taken.owners += group.hasOwner ? 1 : 0;
    taken.tokens += group.tokens;
    taken.end = group.end;
  }
  return taken.end;
}

// the records the batch may take: a catch-up batch takes none past the start sequence
function collectBatchMessages(input: BatchPlanInput): readonly PlannedMessage[] {
  const isCatchUp = input.cursor < input.startSequence;

  return input.messages.filter((message) => !isCatchUp || message.sequence <= input.startSequence);
}

function splitTurnGroups(messages: readonly PlannedMessage[]): readonly TurnGroup[] {
  const groups: TurnGroup[] = [];

  for (const message of messages) {
    const last = groups.at(-1);

    if (message.isOwner || last === undefined) {
      groups.push({ hasOwner: message.isOwner, end: message.sequence, tokens: message.tokens });
    } else {
      groups[groups.length - 1] = {
        ...last,
        end: message.sequence,
        tokens: last.tokens + message.tokens,
      };
    }
  }
  return groups;
}
