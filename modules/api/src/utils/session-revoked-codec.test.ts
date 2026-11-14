import { expect, test } from 'bun:test';
import { sessionRevokedCodec } from './session-revoked-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = sessionRevokedCodec.encode({ identityID: 'identity-b', revokedBy: 'identity-a' });

  expect(sessionRevokedCodec.decode(payload)).toStrictEqual({
    identityID: 'identity-b',
    revokedBy: 'identity-a',
  });
});

test('it refuses a revocation that names no session', () => {
  expect(() => sessionRevokedCodec.decode({ revokedBy: 'identity-a' })).toThrow(/"identityID"/u);
});
