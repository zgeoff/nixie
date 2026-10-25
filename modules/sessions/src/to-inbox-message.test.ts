import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';
import { toInboxMessage } from './to-inbox-message';

test('it passes each image of your message in base64 after its marker, and leaves the markers out of the text', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/jpeg' }] },
    erasable: { status: 'readable', fields: { text: 'Which poster?' } },
  });

  const message = toInboxMessage(
    record,
    { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    buildMockTaskMessageView(),
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47]), new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
  );

  expect(message).toStrictEqual({
    uuid: expect.toBeString(),
    text: '[#48213 · Mon 12 Oct, 21:31, Sydney] Which poster?',
    images: [
      { marker: expect.toBeString(), mediaType: 'image/png', data: 'iVBORw==' },
      { marker: expect.toBeString(), mediaType: 'image/jpeg', data: '/9j/4A==' },
    ],
  });

  expect(message.images?.map((image) => image.marker).join('\n')).toMatch(
    /^<dropped-image id="[0-9a-f]{12}" n="1"\/>\n<dropped-image id="[0-9a-f]{12}" n="2"\/>$/u,
  );
});

test('it passes a message with no images as its text alone', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    erasable: { status: 'readable', fields: { text: 'Only words.' } },
  });

  expect(
    toInboxMessage(
      record,
      { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
      buildMockTaskMessageView(),
    ),
  ).toStrictEqual({
    uuid: expect.toBeString(),
    text: '[#48213 · Mon 12 Oct, 21:31, Sydney] Only words.',
  });
});

test('it leaves out an image whose bytes did not read', () => {
  const record = buildMockLogRecord({
    sequence: 48_213,
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:05Z'),
    payload: { images: [{ mediaType: 'image/png' }] },
    erasable: { status: 'readable', fields: { text: 'Which poster?' } },
  });

  const message = toInboxMessage(
    record,
    { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    buildMockTaskMessageView(),
    [],
  );

  expect(message.images).toBeUndefined();
});
