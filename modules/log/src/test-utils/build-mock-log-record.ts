import { faker } from '@faker-js/faker';
import type { Definitions, JSONObject, LogRecord } from '../types';

export type LogRecordOverrides = Partial<Omit<LogRecord, 'definitions' | 'payload'>> & {
  readonly definitions?: Partial<Definitions>;
  readonly payload?: JSONObject;
};

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
