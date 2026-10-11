import type { JSONObject, RecordInput } from '@heynixie/log';
import type { StepResult } from '@heynixie/tasks';
import type { ModelRecordSource } from './build-model-record';
import { buildModelRecord } from './build-model-record';
import { decodeInboxUUID } from './decode-inbox-uuid';
import type { GuestTurn } from './run-guest-turn';

export interface CompletedTurn {
  readonly turn: GuestTurn;

  // the sequence of every inbox record the turn took
  readonly sent: ReadonlySet<number>;

  // whether the turn left unread inbox records past its batch for the next step
  readonly hasMore: boolean;
}

// Builds the step's result from a turn the guest ended: a record per reply and one for the turn's
// end, the inbox records the model read, and the session's last chain entry as the boundary. A
// turn that failed throws, so the step retries from the boundary it started at.
export function buildStepResult(
  source: ModelRecordSource,
  completed: CompletedTurn,
  before: readonly RecordInput[],
): StepResult {
  const last = completed.turn.ended.at(-1);
  const failure = completed.turn.failure;

  if (failure !== null || last === undefined) {
    throw new Error(
      `the conversation turn failed: ${failure?.reason ?? 'no result'}: ${failure?.detail ?? ''}`,
    );
  }
  return {
    next: completed.hasMore ? 'continue' : 'wait',
    records: [
      ...before,
      ...completed.turn.assistants
        .filter((assistant) => assistant.text !== '')
        .map((assistant) =>
          buildModelRecord(source, 'model.reply', {
            payload: { messageID: assistant.messageID },
            text: assistant.text,
          }),
        ),
      buildModelRecord(source, 'model.turn_ended', { payload: buildTurnSummary(completed.turn) }),
    ],
    acknowledged: completed.turn.read
      .map((uuid) => decodeInboxUUID(uuid))
      .filter((sequence): sequence is number => sequence !== null && completed.sent.has(sequence)),
    sessionBoundary: JSON.stringify(last.boundary),
  };
}

type EndedFrame = GuestTurn['ended'][number];

// the turn's model turns and token counts, over every result the guest reported
function buildTurnSummary(turn: GuestTurn): JSONObject {
  const buildTotal = (pick: (frame: EndedFrame) => number) =>
    turn.ended.reduce((total, frame) => total + pick(frame), 0);

  return {
    stopReason: turn.ended.at(-1)?.stopReason ?? null,
    turns: buildTotal((frame) => frame.turns),
    inputTokens: buildTotal((frame) => frame.usage.inputTokens),
    outputTokens: buildTotal((frame) => frame.usage.outputTokens),
    cacheReadTokens: buildTotal((frame) => frame.usage.cacheReadTokens),
    cacheWriteTokens: buildTotal((frame) => frame.usage.cacheWriteTokens),
  };
}
