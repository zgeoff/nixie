import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { removeTestRecordKey, startTestLog } from '@heynixie/log/test-utils';
import { buildModelRecord } from './build-model-record';
import { modelReplyCodec } from './model-reply-codec';

test('it builds a record of the codec kind whose payload names the model and profile', () => {
  const record = buildModelRecord(
    {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    modelReplyCodec,
    { payload: { messageID: 'message-1' }, text: 'Sure.' },
  );

  expect(record).toStrictEqual({
    kind: 'model.reply',
    definitions: { snapshotHash: 'sha256:test' },
    payload: { model: 'claude-test-1', profile: 'chat-direct', messageID: 'message-1' },
    erasable: { text: 'Sure.' },
  });
});

test('it puts the reasoning summary in the erasable fields beside the text, and the thinking tokens in the payload', () => {
  const record = buildModelRecord(
    {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    modelReplyCodec,
    {
      payload: { messageID: 'message-1', thinkingTokens: 236 },
      text: 'The 09:25 ferry.',
      summary: 'I compared the ferries by arrival time.',
    },
  );

  expect(record).toStrictEqual({
    kind: 'model.reply',
    definitions: { snapshotHash: 'sha256:test' },
    payload: {
      model: 'claude-test-1',
      profile: 'chat-direct',
      messageID: 'message-1',
      thinkingTokens: 236,
    },
    erasable: { text: 'The 09:25 ferry.', summary: 'I compared the ferries by arrival time.' },
  });
});

test('it forgets the reply summary with the reply, and keeps the thinking-token count in the plain payload', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    buildModelRecord(
      {
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      modelReplyCodec,
      {
        payload: { messageID: 'message-1', thinkingTokens: 236 },
        text: 'The 09:25 ferry.',
        summary: 'I compared the ferries by arrival time.',
      },
    ),
  ]);

  const before = await readRecords(ctx.log, { afterSequence: 0 });

  expect(before.at(0)?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { text: 'The 09:25 ferry.', summary: 'I compared the ferries by arrival time.' },
  });

  await removeTestRecordKey(ctx.log, 1);

  const after = await readRecords(ctx.log, { afterSequence: 0 });

  expect(after.at(0)?.record.payload).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    messageID: 'message-1',
    thinkingTokens: 236,
  });

  expect(after.at(0)?.record.erasable).toStrictEqual({ status: 'shredded' });
});

test('it builds a record with no erasable fields when the model wrote no text', () => {
  const record = buildModelRecord(
    {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    modelReplyCodec,
    { payload: { messageID: 'message-1' } },
  );

  expect(record.erasable).toBeUndefined();
});

test('it refuses a payload that does not fit its codec', () => {
  expect(() =>
    buildModelRecord(
      {
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      modelReplyCodec,
      { payload: { messageID: 'message-1', thinkingTokens: -1 } },
    ),
  ).toThrow(/"path": \[\s+"thinkingTokens"\s+\]/u);
});
