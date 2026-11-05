import { expect, test } from 'bun:test';
import { collectIndexedMessages } from './collect-indexed-messages.ts';
import { readRatedMessages } from './read-rated-messages.ts';

test('it encodes the full typed text of a long past message with pasted text, not the text it showed with', async () => {
  const typed = `${'a'.repeat(700)} `;
  const pasted = 'b'.repeat(600);
  const indexed = collectIndexedMessages([
    {
      sequence: 1,
      recordedAt: '2026-03-01T18:00:00Z',
      kind: 'owner_message',
      thread: 'trip-notes',
      parent: null,
      payload: {},
      erasable: {
        status: 'readable',
        fields: {
          text: `${typed}${pasted}${typed}`,
          spans: [
            { start: 0, end: 701, source: 'typed' },
            { start: 701, end: 1301, source: 'pasted' },
            { start: 1301, end: 2002, source: 'typed' },
          ],
        },
      },
    },
  ]);
  const encoded: string[][] = [];

  await readRatedMessages(
    [{ caseID: 't2', query: 'what did I pack?', shownMessages: [{ sequence: 1, text: `${typed}<pasted id="0a1b2c3d4e5f">bbb`, isCut: true }] }],
    new Map([['t2', { isLabelled: true, messages: new Set<string>() }]]),
    indexed,
    {
      encode: async (texts) => {
        encoded.push([...texts]);

        return texts.map(() => new Float32Array([1, 0]));
      },
    },
    [],
  );

  expect(encoded).toStrictEqual([['what did I pack?'], [`${typed}\n${typed}`]]);
});

test('it leaves out a shown message that the product never indexed', async () => {
  const encoded: string[][] = [];

  const rated = await readRatedMessages(
    [{ caseID: 't2', query: 'what did I pack?', shownMessages: [{ sequence: 1, text: 'gone', isCut: false }] }],
    new Map([['t2', { isLabelled: true, messages: new Set<string>() }]]),
    new Map(),
    {
      encode: async (texts) => {
        encoded.push([...texts]);

        return texts.map(() => new Float32Array([1, 0]));
      },
    },
    [],
  );

  expect({ rated, encoded }).toStrictEqual({ rated: [], encoded: [] });
});
