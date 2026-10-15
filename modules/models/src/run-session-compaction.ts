import type { RecordInput } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { SessionPoint } from '@heynixie/wire';
import type { ModelRecordSource } from './build-model-record';
import { buildModelRecord } from './build-model-record';
import { countTextTokens } from './count-text-tokens';
import { formatMessageTime } from './format-message-time';
import { renderCompactionInstruction } from './render-compaction-instruction';
import { renderSummaryCut } from './render-summary-cut';
import type { GuestSummary } from './run-guest-summary';
import { runGuestSummary } from './run-guest-summary';
import type { ConversationRun } from './types';

export interface CompactionRequest {
  readonly taskID: string;

  // the session's last committed boundary, which the summary call forks from
  readonly resume: SessionPoint;

  // what asked for it: a turn that ended past the threshold, or one that overflowed the window
  readonly trigger: 'threshold' | 'overflow';

  // the context the session held before the compaction, when the turn reported one
  readonly contextSize: number | null;

  // the compactions that failed in a row before this one
  readonly failures: number;

  // aborts when the step's lease is lost or a forget invalidates the session
  readonly signal: AbortSignal;
}

// What a compaction commits: the summary record and whether the summary call gave one, or the
// failure record in its place.
export interface CompactionOutcome {
  readonly isSummarized: boolean;
  readonly record: RecordInput;
}

// Asks the model for a summary of the session at its committed boundary, with one request to cut a
// summary past the cap, and returns the record to commit. It writes nothing itself, so a rerun after
// a crash forks from the same boundary. A failed call returns a failure record, and an abort throws.
export async function runSessionCompaction(
  run: ConversationRun,
  request: CompactionRequest,
): Promise<CompactionOutcome> {
  const source: ModelRecordSource = { definitions: run.context.definitions, model: run.model };

  try {
    const throughSequence = await readThroughSequence(run, request.taskID);
    const summary = await runSummaryCalls(run, request);

    return {
      isSummarized: true,
      record: buildModelRecord(source, 'model.session_summarized', {
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

// the last sequence the session held: its newest turn end, which commits after the turn's replies
async function readThroughSequence(run: ConversationRun, taskID: string): Promise<number> {
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

  // the summary's size, which nixie counts as the rebuild budget does
  readonly tokens: number;

  // whether nixie asked for a cut
  readonly isCut: boolean;
}

// One call for the summary, and one more on its fork to cut it when it passes the cap. A summary
// still past the cap, or one whose cut failed, commits as it stands with its size.
async function runSummaryCalls(
  run: ConversationRun,
  request: CompactionRequest,
): Promise<SessionSummary> {
  const cap = run.compaction.summaryTokens;

  const at = formatMessageTime(new Date(run.context.clock.now()), null, {
    defaultZone: run.defaultZone,
    now: new Date(run.context.clock.now()),
  });

  const first = await runSummaryCall(run, request, {
    resume: request.resume,
    instruction: renderCompactionInstruction({
      at,
      summaryTokens: cap,
      ownerName: run.memorySettings.ownerName,
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
  run: ConversationRun,
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
      systemPrompt: run.getSystemPrompt(),
      instruction: call.instruction,
    },
    signal: request.signal,
  });
}

// The failure record in place of the summary, with the count of failures in a row, which the
// client's notice reads, and the error in its erasable fields.
function buildFailedRecord(
  source: ModelRecordSource,
  request: CompactionRequest,
  error: unknown,
): RecordInput {
  const record = buildModelRecord(source, 'model.compaction_failed', {
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
