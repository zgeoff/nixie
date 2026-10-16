import { expect, test } from 'bun:test';
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a caller that slips past the type
  const payload = { messageID: 7 } as unknown as { readonly messageID: string };

  expect(() =>
    buildModelRecord(
      {
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      modelReplyCodec,
      { payload },
    ),
  ).toThrow(/"path": \[\s+"messageID"\s+\]/u);
});
