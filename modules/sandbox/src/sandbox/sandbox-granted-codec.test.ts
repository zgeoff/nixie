import { expect, test } from 'bun:test';
import { sandboxGrantedCodec } from './sandbox-granted-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = sandboxGrantedCodec.encode({
    sandboxID: 'sandbox-1',
    secret: 'model-key',
    host: 'api.example.test',
  });

  expect(sandboxGrantedCodec.decode(payload)).toStrictEqual({
    sandboxID: 'sandbox-1',
    secret: 'model-key',
    host: 'api.example.test',
  });
});

test('it refuses a grant that names no host', () => {
  expect(() => sandboxGrantedCodec.decode({ sandboxID: 'sandbox-1', secret: 'model-key' })).toThrow(
    /"host"/u,
  );
});

test('it decodes a grant that holds a reference and a fingerprint, and one that holds neither', () => {
  const held = sandboxGrantedCodec.encode({
    sandboxID: 'sandbox-1',
    secret: 'model-key',
    host: 'api.example.test',
    reference: 'deployment:anthropic',
    fingerprint: 'a3f09c1e',
  });

  expect(sandboxGrantedCodec.decode(held)).toStrictEqual({
    sandboxID: 'sandbox-1',
    secret: 'model-key',
    host: 'api.example.test',
    reference: 'deployment:anthropic',
    fingerprint: 'a3f09c1e',
  });
});
