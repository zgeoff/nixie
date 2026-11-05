import { expect, test } from 'bun:test';
import { renderShownMessage } from './render-shown-message.ts';

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
