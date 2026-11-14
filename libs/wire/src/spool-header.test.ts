import { expect, test } from 'bun:test';
import { encodeBase64URL } from './encode-base64url';
import { spoolHeaderSchema } from './spool-header';

test('it accepts a header with a 65-byte key, a 12-byte IV and no body bytes', () => {
  const header = {
    version: 1,
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'ab',
    counter: 1,
    receivedAt: 1_798_761_600_000,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    bytes: 0,
    ephemeralKey: encodeBase64URL(new Uint8Array(65)),
    iv: encodeBase64URL(new Uint8Array(12)),
  };

  expect(spoolHeaderSchema.safeParse(header).success).toBeTrue();
});

test.each([
  ['a counter of 0', { counter: 0 }],
  ['a negative byte count', { bytes: -1 }],
  ['an uppercase writer', { writer: 'AB' }],
  ['an endpoint outside messages and responses', { endpoint: 'models' }],
  ['an unknown API', { api: 'other' }],
  ['a key of 64 bytes', { ephemeralKey: encodeBase64URL(new Uint8Array(64)) }],
  ['an IV of 16 bytes', { iv: encodeBase64URL(new Uint8Array(16)) }],
  ['an extra key', { extra: 1 }],
  ['a version of 2', { version: 2 }],
])('it refuses a header with %s', (_title, change) => {
  const header = {
    version: 1,
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'ab',
    counter: 1,
    receivedAt: 1_798_761_600_000,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    bytes: 0,
    ephemeralKey: encodeBase64URL(new Uint8Array(65)),
    iv: encodeBase64URL(new Uint8Array(12)),
    ...change,
  };

  expect(spoolHeaderSchema.safeParse(header).success).toBeFalse();
});
