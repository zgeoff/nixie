import { expect, test } from 'bun:test';
import { store } from '../mocks/store';
import { seedSentFile } from './seed-sent-file';

test('it stores the call and the result of a file send as consecutive records', async () => {
  await seedSentFile({
    file: 'p3n8x2c7ke',
    name: 'orders.csv',
    bytes: 812,
    mediaType: 'text/csv',
    sequence: 40,
  });

  expect(
    store.records.all().map((record) => ({ kind: record.kind, sequence: record.sequence })),
  ).toStrictEqual([
    { kind: 'tool_called', sequence: 40 },
    { kind: 'tool_result', sequence: 41 },
  ]);
});
