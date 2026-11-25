import { expect, test } from 'bun:test';
import { sandboxGrantStartedCodec } from './sandbox-grant-started-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = sandboxGrantStartedCodec.encode({
    secret: 'model-key',
    host: 'api.example.test',
    reference: 'deployment:anthropic',
    fingerprint: 'a3f09c1e',
  });

  expect(sandboxGrantStartedCodec.decode(payload)).toStrictEqual({
    secret: 'model-key',
    host: 'api.example.test',
    reference: 'deployment:anthropic',
    fingerprint: 'a3f09c1e',
  });
});

test('it refuses a started grant that names no secret', () => {
  expect(() => sandboxGrantStartedCodec.decode({ host: 'api.example.test' })).toThrow(/"secret"/u);
});
