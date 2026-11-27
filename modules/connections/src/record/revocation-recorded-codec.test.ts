import { expect, test } from 'bun:test';
import { revocationRecordedCodec } from './revocation-recorded-codec';

test('it decodes a stored revocation record that names the provider error after its provider', () => {
  const stored = {
    connection: 'connection-1',
    outcome: 'refused',
    status: 400,
    googleError: 'invalid_token',
  };

  expect(revocationRecordedCodec.decode(stored)).toStrictEqual({
    connection: 'connection-1',
    outcome: 'refused',
    status: 400,
    providerError: null,
  });
});

test('it encodes the provider error of a revocation', () => {
  expect(
    revocationRecordedCodec.encode({
      connection: 'connection-1',
      outcome: 'refused',
      status: 400,
      providerError: 'invalid_token',
    }),
  ).toStrictEqual({
    connection: 'connection-1',
    outcome: 'refused',
    status: 400,
    providerError: 'invalid_token',
  });
});
