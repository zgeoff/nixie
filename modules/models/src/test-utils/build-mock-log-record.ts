import type { LogRecord } from '@heynixie/log';

// A message from you in the conversation's inbox, with its text readable.
export function buildMockLogRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    sequence: 7,
    recordedAt: new Date(0),
    kind: 'owner_message',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    stepKey: null,
    parent: null,
    contentSource: 'owner',
    decision: null,
    promptCause: null,
    approval: null,
    payload: {},
    erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
    ...overrides,
  };
}
