import { faker } from '@faker-js/faker';
import type { Definitions, JSONObject, LogRecord } from '../types';

// definitions and payload merge into the defaults; every other field replaces its default whole,
// because erasable, decision and approval are unions or nullable objects with no fields to merge into
export type LogRecordOverrides = Partial<Omit<LogRecord, 'definitions' | 'payload'>> & {
  readonly definitions?: Partial<Definitions>;
  readonly payload?: JSONObject;
};

// A record as readRecords returns it: the log's own reset kind, which every package's registry
// holds, no thread, no step, no erasable fields, and an empty payload.
export function buildMockLogRecord(overrides: LogRecordOverrides = {}): LogRecord {
  return {
    sequence: faker.number.int({ min: 1, max: 1_000_000 }),
    recordedAt: faker.date.recent(),
    kind: 'log_reset',
    thread: null,
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    erasable: { status: 'none' },
    ...overrides,
    definitions: {
      snapshotHash: `sha256:${faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' })}`,
      ...overrides.definitions,
    },
    payload: { ...overrides.payload },
  };
}
