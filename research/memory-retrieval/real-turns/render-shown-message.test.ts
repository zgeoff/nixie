import { expect, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { buildMockLogRecord } from '../../../modules/log/src/test-utils/build-mock-log-record.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderImageMarkers } from '../../../modules/sessions/src/render-image-markers.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderOwnerText } from '../../../modules/sessions/src/render-owner-text.ts';
import { renderShownMessage } from './render-shown-message.ts';

test('it renders a message with a pasted span and an image as the product renderers do', () => {
  const fields = {
    text: 'fix the LOG line',
    spans: [
      { start: 0, end: 8, source: 'typed' },
      { start: 8, end: 11, source: 'pasted' },
      { start: 11, end: 16, source: 'typed' },
    ],
  };
  const payload = { images: [{ mediaType: 'image/png' }] };
  const product = buildMockLogRecord({ erasable: { status: 'readable', fields }, payload });
  const withoutIDs = (text: string | undefined) => text?.replaceAll(/id="\w{12}"/g, 'id=""');

  const shown = renderShownMessage({
    sequence: 7,
    recordedAt: '2026-03-02T09:00:00Z',
    kind: 'owner_message',
    thread: 'conversation',
    parent: null,
    payload,
    erasable: { status: 'readable', fields },
  });

  expect(withoutIDs(shown?.text)).toBe(withoutIDs([renderOwnerText(product), ...renderImageMarkers(product)].join('\n')));
});

test('it wraps pasted text in a tag with a fresh block ID, as the product shows it', () => {
  const shown = renderShownMessage({
    sequence: 3,
    recordedAt: '2026-03-02T09:00:00Z',
    kind: 'owner_message',
    thread: 'conversation',
    parent: null,
    payload: {},
    erasable: {
      status: 'readable',
      fields: {
        text: 'see LOG please',
        spans: [
          { start: 0, end: 4, source: 'typed' },
          { start: 4, end: 7, source: 'pasted' },
          { start: 7, end: 14, source: 'typed' },
        ],
      },
    },
  });

  expect(shown).toStrictEqual({ text: expect.stringMatching(/^see <pasted id="(\w{12})">LOG<\/pasted id="\1"> please$/), isCut: false });
});

test('it cuts a long message at 1,000 characters and cuts the span that crosses the cut', () => {
  const shown = renderShownMessage({
    sequence: 4,
    recordedAt: '2026-03-02T09:00:00Z',
    kind: 'owner_message',
    thread: 'conversation',
    parent: null,
    payload: {},
    erasable: {
      status: 'readable',
      fields: {
        text: `${'a'.repeat(990)}${'b'.repeat(30)}`,
        spans: [
          { start: 0, end: 990, source: 'typed' },
          { start: 990, end: 1020, source: 'pasted' },
        ],
      },
    },
  });

  expect(shown).toStrictEqual({
    text: expect.stringMatching(new RegExp(`^a{990}<pasted id="(\\w{12})">b{10}</pasted id="\\1">$`)),
    isCut: true,
  });
});

test('it adds a marker for each image the message carried', () => {
  const shown = renderShownMessage({
    sequence: 5,
    recordedAt: '2026-03-02T09:00:00Z',
    kind: 'owner_message',
    thread: 'conversation',
    parent: null,
    payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/jpeg' }] },
    erasable: { status: 'readable', fields: { text: 'the new shed' } },
  });

  expect(shown).toStrictEqual({
    text: expect.stringMatching(/^the new shed\n<dropped-image id="\w{12}" n="1"\/>\n<dropped-image id="\w{12}" n="2"\/>$/),
    isCut: false,
  });
});

test('it gives nothing for a message whose text was shredded', () => {
  expect(
    renderShownMessage({
      sequence: 6,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'shredded' },
    }),
  ).toBeNull();
});
