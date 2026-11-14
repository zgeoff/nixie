import type { LogRecord } from '@heynixie/log';
import { buildMockLogRecord } from '@heynixie/log/test-utils';

export function buildMockTaskMessageRecord(sequence: number, hop: number): LogRecord {
  return buildMockLogRecord({
    sequence,
    kind: 'task_message',
    thread: 't4m2',
    payload: {
      messageID: `m${sequence}`,
      from: 'conversation',
      to: 't4m2',
      kind: 'request',
      replyTo: null,
      onBehalfOf: [],
      hop,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    },
  });
}
