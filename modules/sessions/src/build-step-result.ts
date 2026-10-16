import type { RecordInput } from '@heynixie/log';
import type { ModelRecordSource } from '@heynixie/models';
import { buildModelRecord, modelReplyCodec, modelTurnEndedCodec } from '@heynixie/models';
import type { StepResult } from '@heynixie/tasks';
import { decodeInboxUUID } from './decode-inbox-uuid';
import { isContextOverflow } from './is-context-overflow';
import type { GuestTurn } from './run-guest-turn';
import type { ImageTally, MemoryRef } from './types';

export interface CompletedTurn {
  readonly turn: GuestTurn;

  // the sequence of every inbox record the turn took
  readonly sent: ReadonlySet<number>;

  // whether the turn left unread inbox records past its batch for the next step
  readonly hasMore: boolean;

  // the last sequence the turn's memory note covered, or null when the turn had no note
  readonly notedThrough: number | null;

  // the images the session holds after the turn, which every later request repeats
  readonly images: ImageTally;
}

// The memory a turn placed, which its record lists as references and never as text.
interface TurnMemoryRefs {
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];

  // the sequences of the past messages the turn's retrieval placed
  readonly retrievedMessages: readonly number[];

  // the newest session invalidation the turn saw before it ran
  readonly invalidatedThrough: number;
}

// A turn the guest ended, with the memory the step placed in it.
export interface StepTurn extends CompletedTurn {
  readonly memory: TurnMemoryRefs;
}

// Builds the step's result from a turn the guest ended: its records, the inbox records the model
// read, and the session's last chain entry as the boundary. A turn that failed, or one whose context
// passed the window, throws, so the step retries from the boundary it started at.
export function buildStepResult(
  source: ModelRecordSource,

  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the rule reads a ReadonlySet's methods as mutable
  completed: StepTurn,
  before: readonly RecordInput[],
): StepResult {
  const last = completed.turn.ended.at(-1);
  const failure = completed.turn.failure;

  if (failure !== null || last === undefined) {
    throw new Error(
      `the conversation turn failed: ${failure?.reason ?? 'no result'}: ${failure?.detail ?? ''}`,
    );
  }

  if (isContextOverflow(last)) {
    throw new Error(
      `the conversation turn passed the context window: ${last.terminalReason ?? ''}`,
    );
  }

  return {
    next: completed.hasMore ? 'continue' : 'wait',
    records: [...before, ...buildTurnRecords(source, completed)],
    acknowledged: completed.turn.read
      .map((uuid) => decodeInboxUUID(uuid))
      .filter((sequence): sequence is number => sequence !== null && completed.sent.has(sequence)),
    sessionBoundary: JSON.stringify(last.boundary),
  };
}

// a record per reply with text, and one for the turn's end with the memory it placed
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the rule reads a ReadonlySet's methods as mutable
function buildTurnRecords(source: ModelRecordSource, completed: StepTurn): readonly RecordInput[] {
  return [
    ...completed.turn.assistants
      .filter((assistant) => assistant.text !== '')
      .map((assistant) =>
        buildModelRecord(source, modelReplyCodec, {
          payload: { messageID: assistant.messageID },
          text: assistant.text,
        }),
      ),
    buildModelRecord(source, modelTurnEndedCodec, {
      payload: {
        ...buildTurnSummary(completed.turn),
        pinnedCore: completed.memory.pinnedCore.map((ref) => ({ ...ref })),
        retrieved: completed.memory.retrieved.map((ref) => ({ ...ref })),
        retrievedMessages: [...completed.memory.retrievedMessages],
        invalidatedThrough: completed.memory.invalidatedThrough,
        sessionImageBytes: completed.images.bytes,
        sessionImageCount: completed.images.count,
        ...(completed.turn.endedMark === undefined
          ? {}
          : { recalledThrough: completed.turn.endedMark }),
        ...(completed.notedThrough === null ? {} : { memoryNotedThrough: completed.notedThrough }),
      },
    }),
  ];
}

type EndedFrame = GuestTurn['ended'][number];

type TurnSummary = Pick<
  ReturnType<typeof modelTurnEndedCodec.decode>,
  | 'stopReason'
  | 'terminalReason'
  | 'turns'
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'contextSize'
  | 'contextWindow'
>;

// The turn's model turns and token counts over every result, the SDK's reason for the last end, and
// the context the last reported model call read with the window nixie compacts within. The counts
// are totals; the context size is the one figure that shows how full the context stands.
function buildTurnSummary(turn: GuestTurn): TurnSummary {
  const buildTotal = (pick: (frame: EndedFrame) => number) =>
    turn.ended.reduce((total, frame) => total + pick(frame), 0);

  const context = turn.ended.findLast((frame) => frame.context !== undefined)?.context;
  const terminalReason = turn.ended.at(-1)?.terminalReason;

  return {
    stopReason: turn.ended.at(-1)?.stopReason ?? null,
    ...(terminalReason === undefined ? {} : { terminalReason }),
    turns: buildTotal((frame) => frame.turns),
    inputTokens: buildTotal((frame) => frame.usage.inputTokens),
    outputTokens: buildTotal((frame) => frame.usage.outputTokens),
    cacheReadTokens: buildTotal((frame) => frame.usage.cacheReadTokens),
    cacheWriteTokens: buildTotal((frame) => frame.usage.cacheWriteTokens),
    ...(context === undefined ? {} : { contextSize: context.size, contextWindow: context.window }),
  };
}
