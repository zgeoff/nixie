import type { RecordInput } from '@heynixie/log';
import type { ModelRecordSource } from '@heynixie/models';
import { buildModelRecord, modelReplyCodec, modelTurnEndedCodec } from '@heynixie/models';
import type { StepResult } from '@heynixie/tasks';
import { decodeInboxUUID } from './decode-inbox-uuid';
import { isContextOverflow } from './is-context-overflow';
import { ModelAuthError } from './model-auth-error';
import type { GuestTurn } from './run-guest-turn';
import type { ImageTally, MemoryRef } from './types';

export interface CompletedTurn {
  readonly turn: GuestTurn;

  readonly sent: ReadonlySet<number>;

  readonly hasMore: boolean;

  readonly notedThrough: number | null;

  readonly images: ImageTally;
}

interface TurnMemoryRefs {
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];

  readonly retrievedMessages: readonly number[];

  readonly invalidatedThrough: number;
}

export interface StepTurn extends CompletedTurn {
  readonly memory: TurnMemoryRefs;
}

export function buildStepResult(
  source: ModelRecordSource,

  completed: StepTurn,
  before: readonly RecordInput[],
): StepResult {
  const last = completed.turn.ended.at(-1);
  const failure = completed.turn.failure;

  if (failure?.reason === 'model_auth') {
    throw new ModelAuthError(failure.detail);
  }

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

function buildTurnRecords(source: ModelRecordSource, completed: StepTurn): readonly RecordInput[] {
  const replies = completed.turn.assistants.filter((assistant) => assistant.text !== '');
  const reasoning = buildTurnReasoning(completed.turn);

  return [
    ...replies.map((assistant, index) => {
      // The SDK's summarized display sends the reasoning as its own message and reports thinking
      // tokens once per turn, so the joined summary and the total sit on the last reply.
      const isLast = index === replies.length - 1;

      return buildModelRecord(source, modelReplyCodec, {
        payload: {
          messageID: assistant.messageID,
          ...(isLast && reasoning.thinkingTokens > 0
            ? { thinkingTokens: reasoning.thinkingTokens }
            : {}),
        },
        text: assistant.text,
        ...(isLast && reasoning.summary !== '' ? { summary: reasoning.summary } : {}),
      });
    }),
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

interface TurnReasoning {
  readonly summary: string;
  readonly thinkingTokens: number;
}

function buildTurnReasoning(turn: GuestTurn): TurnReasoning {
  const summary = turn.assistants
    .flatMap((assistant) => (assistant.summary === undefined ? [] : [assistant.summary]))
    .join('\n\n');

  const thinkingTokens = turn.ended.reduce(
    (total, frame) => total + (frame.thinkingTokens ?? 0),
    0,
  );

  return { summary, thinkingTokens };
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
