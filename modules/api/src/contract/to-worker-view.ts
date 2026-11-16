import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import {
  workerRunEndedCodec,
  workerRunStartedCodec,
  workerTurnEndedCodec,
} from '@heynixie/sessions';

type WorkerView = NonNullable<ContractRecord['worker']>;

export function toWorkerView(record: LogRecord): WorkerView | undefined {
  if (record.kind === workerRunStartedCodec.kind) {
    return toStarted(record);
  }

  if (record.kind === workerTurnEndedCodec.kind) {
    return toTurn(record);
  }

  if (record.kind === workerRunEndedCodec.kind) {
    return toEnded(record);
  }

  return undefined;
}

function toStarted(record: LogRecord): WorkerView | undefined {
  const started = workerRunStartedCodec.tryDecodePartial(record.payload);

  if (
    started?.workerRunID === undefined ||
    started.shortID === undefined ||
    started.callID === undefined ||
    started.model === undefined ||
    started.tools === undefined ||
    started.limits === undefined ||
    started.isTaskLimit === undefined
  ) {
    return undefined;
  }

  return {
    phase: 'started',
    workerRunID: started.workerRunID,
    shortID: started.shortID,
    callID: started.callID,
    model: started.model,
    tools: [...started.tools],
    limits: started.limits,
    isTaskLimit: started.isTaskLimit,
  };
}

function toTurn(record: LogRecord): WorkerView | undefined {
  const turn = workerTurnEndedCodec.tryDecodePartial(record.payload);

  if (
    turn?.workerRunID === undefined ||
    turn.callID === undefined ||
    turn.turn === undefined ||
    turn.dollars === undefined
  ) {
    return undefined;
  }

  const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

  const tokens =
    (turn.inputTokens ?? 0) +
    (turn.outputTokens ?? 0) +
    (turn.cacheReadTokens ?? 0) +
    (turn.cacheWriteTokens ?? 0);

  return {
    phase: 'turn',
    workerRunID: turn.workerRunID,
    callID: turn.callID,
    turn: turn.turn,
    tokens,
    dollars: turn.dollars,
    ...(typeof text === 'string' ? { text } : {}),
  };
}

function toEnded(record: LogRecord): WorkerView | undefined {
  const ended = workerRunEndedCodec.tryDecodePartial(record.payload);

  if (
    ended?.workerRunID === undefined ||
    ended.callID === undefined ||
    ended.outcome === undefined ||
    ended.used === undefined
  ) {
    return undefined;
  }

  const detail =
    record.erasable.status === 'readable' ? record.erasable.fields['detail'] : undefined;

  return {
    phase: 'ended',
    workerRunID: ended.workerRunID,
    callID: ended.callID,
    outcome: ended.outcome,
    ...(ended.limit === undefined ? {} : { limit: ended.limit }),
    used: ended.used,
    ...(typeof detail === 'string' ? { detail } : {}),
  };
}
