import { expect, test } from 'bun:test';
import { identityRefusedCodec } from './identity-refused-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = identityRefusedCodec.encode({
    channel: 'client',
    externalID: 'ab12',
    refusedAt: 1_000_000,
  });

  expect(identityRefusedCodec.decode(payload)).toStrictEqual({
    channel: 'client',
    externalID: 'ab12',
    refusedAt: 1_000_000,
  });
});

test('it refuses a refusal without its time', () => {
  expect(() => identityRefusedCodec.decode({ channel: 'client', externalID: 'ab12' })).toThrow(
    /"refusedAt"/u,
  );
});
