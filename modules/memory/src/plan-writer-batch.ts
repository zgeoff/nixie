import type { WriterConfig } from './writer-config-schema';
import type { BatchBounds, BatchMode } from './writer-types';

interface PlannedMessage {
  readonly sequence: number;
  readonly isOwner: boolean;
  readonly tokens: number;
  readonly arrivedAt: number | null;
}

export interface BatchPlanInput {
  readonly cursor: number;

  readonly startSequence: number;

  readonly messages: readonly PlannedMessage[];
  readonly now: number;
  readonly lastBatchAt: number | null;
  readonly config: WriterConfig;
}

export type BatchPlan =
  | { readonly kind: 'batch'; readonly bounds: BatchBounds; readonly mode: BatchMode }
  | { readonly kind: 'wait'; readonly wakeAt: number | null };

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

function planEarliestBatch(input: BatchPlanInput, owners: readonly PlannedMessage[]): number {
  const dueAt = planDueTime(input, owners);
  const paceAt = input.lastBatchAt === null ? dueAt : input.lastBatchAt + input.config.paceMs;

  return Math.max(dueAt, paceAt);
}

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

interface TurnGroup {
  readonly hasOwner: boolean;
  readonly end: number;
  readonly tokens: number;
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

function collectBatchMessages(input: BatchPlanInput): readonly PlannedMessage[] {
  const isCatchUp = input.cursor < input.startSequence;

  return input.messages.filter((message) => !isCatchUp || message.sequence <= input.startSequence);
}
