import { expect, test } from 'bun:test';
import { ownerMessageCodec } from './owner-message-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = ownerMessageCodec.encode({
    clientMessageId: 'client-1',
    identityID: 'identity-1',
    spans: 'as_sent',
    timeZone: 'Australia/Sydney',
    images: [{ mediaType: 'image/png' }],
  });

  expect(ownerMessageCodec.decode(payload)).toStrictEqual({
    clientMessageId: 'client-1',
    identityID: 'identity-1',
    spans: 'as_sent',
    timeZone: 'Australia/Sydney',
    images: [{ mediaType: 'image/png' }],
  });
});

test('it decodes a message with no time zone and no images', () => {
  expect(
    ownerMessageCodec.decode({
      clientMessageId: 'client-1',
      identityID: 'identity-1',
      spans: 'unknown',
    }),
  ).toStrictEqual({ clientMessageId: 'client-1', identityID: 'identity-1', spans: 'unknown' });
});

test('it refuses an image of a type the model does not take', () => {
  expect(() =>
    ownerMessageCodec.decode({
      clientMessageId: 'client-1',
      identityID: 'identity-1',
      spans: 'as_sent',
      images: [{ mediaType: 'image/tiff' }],
    }),
  ).toThrow(/"path": \[\s+"images",\s+0,\s+"mediaType"\s+\]/u);
});
