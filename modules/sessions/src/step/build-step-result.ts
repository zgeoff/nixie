import type { RecordInput } from '@heynixie/log';
import type { Harness, ModelPrices, ModelRecordSource } from '@heynixie/models';
import {
  buildModelEventRecord,
  buildModelRecord,
  buildTokensCost,
  modelReplyCodec,
  modelTurnEndedCodec,
} from '@heynixie/models';
import type { StepResult } from '@heynixie/tasks';
import { decodeInboxUUID } from '../inbox/decode-inbox-uuid';
import { ModelAPIError } from '../turn/model-api-error';
import type { ImageTally, MemoryRef } from '../types';
import { buildReplyVoids } from '../utils/build-reply-voids';
import { isContextOverflow } from '../utils/is-context-overflow';
import type { GuestTurn } from '../utils/run-guest-turn';
import { checkEndedContract } from './check-ended-contract';
import { ModelAuthError } from './model-auth-error';

export interface CompletedTurn {
  readonly turn: GuestTurn;

  readonly sent: ReadonlySet<number>;

  // the sequences among those sent that render no text, so the guest never reports them read and
  // the host acknowledges them itself
  readonly silent: ReadonlySet<number>;

  readonly hasMore: boolean;

  readonly notedThrough: number | null;

  // the newest wait notice past the batch, which the turn's opening told now or an earlier turn's did
  readonly waitNoticeToldThrough: number | null;

  readonly images: ImageTally;

  readonly isSilent: boolean;

  // the step run that wrote the turn's replies
  readonly runID: string;
}

interface TurnMemoryRefs {
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];

  readonly invalidatedThrough: number;
}

export interface StepTurn extends CompletedTurn {
  readonly harness: Harness;

  // the prices of the profile the turn ran on, null when it sets none
  readonly prices: ModelPrices | null;
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

  if (failure?.reason === 'model_api') {
    throw new ModelAPIError(failure.error, failure.detail);
  }

  if (failure !== null || last === undefined) {
    throw new Error(
      `the conversation turn failed: ${failure?.reason ?? 'no result'}: ${failure?.detail ?? ''}`,
    );
  }

  for (const ended of completed.turn.ended) {
    checkEndedContract(completed.harness, ended);
  }

  if (isContextOverflow(last)) {
    throw new Error('the conversation turn passed the context window');
  }

  return {
    next: completed.hasMore ? 'continue' : 'wait',
    records: [...before, ...buildTurnRecords(source, completed)],
    acknowledged: [
      ...completed.turn.read
        .map((uuid) => decodeInboxUUID(uuid))
        .filter(
          (sequence): sequence is number => sequence !== null && completed.sent.has(sequence),
        ),
      ...completed.silent,
    ],
    sessionBoundary: completed.harness.session === null ? null : JSON.stringify(last.boundary),
  };
}

function buildTurnRecords(source: ModelRecordSource, completed: StepTurn): readonly RecordInput[] {
  const summary = buildTurnSummary(completed.turn);

  return [
    ...buildReplyRecords(source, completed),
    buildModelEventRecord(source, modelTurnEndedCodec, {
      ...summary,
      ...buildTurnDollars(summary, completed.prices),
      ...(buildThinkingTokens(completed.turn) > 0
        ? { thinkingTokens: buildThinkingTokens(completed.turn) }
        : {}),
      ...(buildCutCalls(completed.turn) > 0 ? { cutCalls: buildCutCalls(completed.turn) } : {}),
      ...(completed.isSilent ? { isSilent: true } : {}),
      pinnedCore: completed.memory.pinnedCore.map((ref) => ({ ...ref })),
      retrieved: completed.memory.retrieved.map((ref) => ({ ...ref })),
      invalidatedThrough: completed.memory.invalidatedThrough,
      sessionImageBytes: completed.images.bytes,
      sessionImageCount: completed.images.count,
      ...(completed.turn.endedMark === undefined
        ? {}
        : { recalledThrough: completed.turn.endedMark }),
      ...(completed.notedThrough === null ? {} : { memoryNotedThrough: completed.notedThrough }),
      ...(completed.waitNoticeToldThrough === null
        ? {}
        : { waitNoticeToldThrough: completed.waitNoticeToldThrough }),
    }),
  ];
}

type EndedFrame = GuestTurn['ended'][number];

type TurnSummary = Pick<
  ReturnType<typeof modelTurnEndedCodec.decode>,
  | 'outcome'
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
  const last = turn.ended.at(-1);
  const terminalReason = last?.terminalReason;

  return {
    ...(last === undefined ? {} : { outcome: last.outcome }),
    stopReason: last?.stopReason ?? null,
    ...(terminalReason === undefined ? {} : { terminalReason }),
    turns: buildTotal((frame) => frame.turns),
    inputTokens: buildTotal((frame) => frame.usage.inputTokens),
    outputTokens: buildTotal((frame) => frame.usage.outputTokens),
    cacheReadTokens: buildTotal((frame) => frame.usage.cacheReadTokens),
    cacheWriteTokens: buildTotal((frame) => frame.usage.cacheWriteTokens),
    ...(context === undefined ? {} : { contextSize: context.size, contextWindow: context.window }),
  };
}

// The turn wrote each reply as the model sent it. The commit writes only the error texts the turn
// held, and voids the replies after the last result, which no resumed session holds.
function buildReplyRecords(
  source: ModelRecordSource,
  completed: Pick<CompletedTurn, 'turn' | 'runID'>,
): readonly RecordInput[] {
  const turn = completed.turn;

  const errors = turn.assistants
    .filter((assistant) => assistant.isError === true && assistant.text !== '')
    .map((assistant) =>
      buildModelRecord(source, modelReplyCodec, {
        payload: { messageID: assistant.messageID },
        text: assistant.text,
      }),
    );

  return [
    ...errors,
    ...buildReplyVoids(source, {
      sequences: turn.written.slice(turn.settledWritten),
      runID: completed.runID,
      reason: 'turn_dropped',
    }),
  ];
}

function buildTurnDollars(
  summary: TurnSummary,
  prices: ModelPrices | null,
): { readonly dollars?: number } {
  return prices === null ? {} : { dollars: buildTokensCost(summary, prices) };
}

function buildThinkingTokens(turn: GuestTurn): number {
  return turn.ended.reduce((total, frame) => total + (frame.thinkingTokens ?? 0), 0);
}

function buildCutCalls(turn: GuestTurn): number {
  return turn.ended.reduce((total, frame) => total + (frame.cutCalls ?? 0), 0);
}
