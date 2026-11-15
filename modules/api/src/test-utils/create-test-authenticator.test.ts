import { expect, test } from 'bun:test';
import { createTestAuthenticator } from './create-test-authenticator';

test('it signs an assertion whose client data carries the challenge and the origin it is given', async () => {
  const authenticator = await createTestAuthenticator();

  const assertion = await authenticator.assert(
    { challenge: 'abc123', rpId: 'nixie.example.org' },
    { origin: 'https://nixie.example.org' },
  );

  const clientData = JSON.parse(
    Buffer.from(assertion.response.clientDataJSON, 'base64url').toString(),
  );

  expect(clientData).toStrictEqual({
    type: 'webauthn.get',
    challenge: 'abc123',
    origin: 'https://nixie.example.org',
    crossOrigin: false,
  });
});

test('it leaves the user verification flag out of authenticator data when told to', async () => {
  const authenticator = await createTestAuthenticator();

  const assertion = await authenticator.assert(
    { challenge: 'abc123', rpId: 'nixie.example.org' },
    { isUserVerified: false },
  );

  const flags = Buffer.from(assertion.response.authenticatorData, 'base64url').readUInt8(32);

  expect(flags & 0x04).toBe(0);
});
