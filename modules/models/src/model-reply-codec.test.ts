import { expect, test } from 'bun:test';
import { modelReplyCodec } from './model-reply-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelReplyCodec.encode({
    model: 'claude-test-1',
    profile: 'chat-direct',
    messageID: 'message-1',
  });

  expect(modelReplyCodec.decode(payload)).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    messageID: 'message-1',
  });
});

test('it refuses a reply that names no message', () => {
  expect(() => modelReplyCodec.decode({ model: 'claude-test-1', profile: 'chat-direct' })).toThrow(
    /"path": \[\s+"messageID"\s+\]/u,
  );
});
