import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { startTestCalls } from '../test-utils';
import { callSpokeCodec } from './call-spoke-codec';

test('it round-trips its payload', () => {
  const payload = {
    callID: 'c1',
    lineID: 'ln4k7m2xq9',
    speaker: 'speech_layer',
    model: 'gpt-live-1',
    heardChars: 12,
  } as const;

  expect(callSpokeCodec.decode(callSpokeCodec.encode(payload))).toStrictEqual(payload);
});

test('it keeps the line text in the erasable fields of its record', async () => {
  const ctx = await startTestCalls();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeRecordsInTransaction(tx, ctx.log, [
      {
        kind: callSpokeCodec.kind,
        definitions: ctx.context.definitions(),
        thread: 'call-thread',
        payload: callSpokeCodec.encode({
          callID: 'c1',
          lineID: 'ln4k7m2xq9',
          speaker: 'speech_layer',
          model: 'gpt-live-1',
          heardChars: 5,
        }),
        erasable: { text: 'Hello there.' },
      },
    ]),
  );

  const found = await readRecords(ctx.log, { afterSequence: 0, kinds: ['call.spoke'] });

  expect(found.map((entry) => [entry.record.thread, entry.record.erasable])).toStrictEqual([
    ['call-thread', { status: 'readable', fields: { text: 'Hello there.' } }],
  ]);
});
