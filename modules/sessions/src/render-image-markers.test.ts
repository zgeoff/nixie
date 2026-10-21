import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderImageMarkers } from './render-image-markers';

test('it renders a numbered marker with a fresh random ID for each image, in the order sent', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/gif' }] },
    erasable: { status: 'readable', fields: { text: 'Two banners.' } },
  });

  const markers = renderImageMarkers(record);

  expect(markers).toStrictEqual([
    expect.stringMatching(/^<dropped-image id="[0-9a-f]{12}" n="1"\/>$/u),
    expect.stringMatching(/^<dropped-image id="[0-9a-f]{12}" n="2"\/>$/u),
  ]);

  expect(new Set(markers.map((marker) => marker.replace(/ n="\d+"/u, ''))).size).toBe(2);
});

test('it renders a fresh ID each time it renders the same image', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    payload: { images: [{ mediaType: 'image/png' }] },
    erasable: { status: 'readable', fields: { text: 'A banner.' } },
  });

  expect(renderImageMarkers(record)).not.toStrictEqual(renderImageMarkers(record));
});

test('it renders no marker for a message with no images', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    payload: {},
    erasable: { status: 'readable', fields: { text: 'Only words.' } },
  });

  expect(renderImageMarkers(record)).toStrictEqual([]);
});

test('it renders no marker for a forgotten message', () => {
  const record = buildMockLogRecord({
    kind: 'owner_message',
    payload: { images: [{ mediaType: 'image/png' }] },
    erasable: { status: 'shredded' },
  });

  expect(renderImageMarkers(record)).toStrictEqual([]);
});
