import type { Definitions, RecordInput } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { ModelRecordSource } from '@heynixie/models';
import {
  buildModelRecord,
  modelCompactionFailedCodec,
  modelSessionSummarizedCodec,
} from '@heynixie/models';
import type { PromptOverrides } from '@heynixie/prompts';
import type { GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { SessionPoint, TurnProfile } from '@heynixie/wire';
import { countTextTokens } from './count-text-tokens';
import { renderCompactionInstruction } from './render-compaction-instruction';
import { renderSummaryCut } from './render-summary-cut';
import type { GuestSummary } from './run-guest-summary';
import { runGuestSummary } from './run-guest-summary';
import type { CompactionSettings, LogContext } from './types';

export interface CompactionRun {
  readonly context: LogContext & { readonly definitions: () => Definitions };
  readonly model: ModelRecordSource['model'];

  readonly turnProfile: TurnProfile;
  readonly sandbox: Sandbox;
  readonly command: GuestCommand;
  readonly compaction: CompactionSettings;
}

export interface CompactionRequest {
  readonly taskID: string;

  readonly resume: SessionPoint;

  readonly trigger: 'threshold' | 'overflow';

  readonly contextSize: number | null;

  readonly failures: number;

  readonly signal: AbortSignal;

  readonly systemPrompt: string;

  readonly at: string;
  readonly ownerName: string | null;
  readonly prompts: PromptOverrides;
}

export interface CompactionOutcome {
  readonly isSummarized: boolean;
  readonly record: RecordInput;
}

export async function runSessionCompaction(
  run: CompactionRun,
  request: CompactionRequest,
): Promise<CompactionOutcome> {
  const source: ModelRecordSource = { definitions: run.context.definitions, model: run.model };

  try {
    const throughSequence = await readThroughSequence(run, request.taskID);
    const summary = await runSummaryCalls(run, request);

    return {
      isSummarized: true,
      record: buildModelRecord(source, modelSessionSummarizedCodec, {
        payload: {
          throughSequence,
          boundary: { ...request.resume },
          trigger: request.trigger,
          ...(request.contextSize === null ? {} : { contextSize: request.contextSize }),
          summaryTokens: summary.tokens,
          isCut: summary.isCut,
        },
        text: summary.text,
      }),
    };
  } catch (error) {
    request.signal.throwIfAborted();

    return { isSummarized: false, record: buildFailedRecord(source, request, error) };
  }
}

async function readThroughSequence(run: CompactionRun, taskID: string): Promise<number> {
  const [turn] = await readRecords(run.context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['model.turn_ended'],
    order: 'newest',
    limit: 1,
  });

  return turn?.record.sequence ?? 0;
}

interface SessionSummary {
  readonly text: string;

  readonly tokens: number;

  readonly isCut: boolean;
}

async function runSummaryCalls(
  run: CompactionRun,
  request: CompactionRequest,
): Promise<SessionSummary> {
  const cap = run.compaction.summaryTokens;
  const at = request.at;

  const first = await runSummaryCall(run, request, {
    resume: request.resume,
    instruction: renderCompactionInstruction({
      at,
      summaryTokens: cap,
      ownerName: request.ownerName,
      prompts: request.prompts,
    }),
  });

  const tokens = countTextTokens(first.text);

  if (tokens <= cap) {
    return { text: first.text, tokens, isCut: false };
  }

  const cut = await runSummaryCall(run, request, {
    resume: first.boundary,
    instruction: renderSummaryCut({ at, tokens, summaryTokens: cap }),
  }).catch(() => {
    request.signal.throwIfAborted();

    return first;
  });

  return { text: cut.text, tokens: countTextTokens(cut.text), isCut: true };
}

interface SummaryCall {
  readonly resume: SessionPoint;
  readonly instruction: string;
}

function runSummaryCall(
  run: CompactionRun,
  request: CompactionRequest,
  call: SummaryCall,
): Promise<GuestSummary> {
  return runGuestSummary({
    sandbox: run.sandbox,
    command: run.command,
    frame: {
      type: 'summarize',
      profile: run.turnProfile,
      resume: call.resume,
      systemPrompt: request.systemPrompt,
      instruction: call.instruction,
    },
    signal: request.signal,
  });
}

function buildFailedRecord(
  source: ModelRecordSource,
  request: CompactionRequest,
  error: unknown,
): RecordInput {
  const record = buildModelRecord(source, modelCompactionFailedCodec, {
    payload: {
      trigger: request.trigger,
      failures: request.failures + 1,
      ...(request.contextSize === null ? {} : { contextSize: request.contextSize }),
    },
  });

  return {
    ...record,
    erasable: { message: error instanceof Error ? error.message : String(error) },
  };
}
