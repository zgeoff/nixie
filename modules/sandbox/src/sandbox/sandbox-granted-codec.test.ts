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
