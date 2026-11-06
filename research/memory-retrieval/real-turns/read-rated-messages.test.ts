import { expect, test } from 'bun:test';
import { collectIndexedMessages } from './collect-indexed-messages.ts';
import { readRatedMessages } from './read-rated-messages.ts';

test('it encodes the full typed text of a long past message with pasted text', async () => {
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
    [{ caseID: 't2', query: 'what did I pack?', shownMessages: [{ sequence: 1 }] }],
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

test('it rates each indexed message by its stored similarity to the query and by whether the rater needed it', async () => {
  const vectors = new Map([
    ['the tide turns at four', new Float32Array([1, 0])],
    ['bought new oars', new Float32Array([0, 1])],
  ]);

  const rated = await readRatedMessages(
    [
      {
        caseID: 't2',
        query: 'when is the tide?',
        shownMessages: [
          { sequence: 1 },
          { sequence: 2 },
        ],
      },
    ],
    new Map([['t2', { isLabelled: true, messages: new Set(['message:1']) }]]),
    new Map([
      [1, 'the tide turns at four'],
      [2, 'bought new oars'],
    ]),
    { encode: async (texts) => texts.map((text) => vectors.get(text) ?? new Float32Array([1, 0])) },
    [],
  );

  expect(rated).toStrictEqual([
    { similarity: expect.closeTo(0.09, 6), isHelpful: true },
    { similarity: 0, isHelpful: false },
  ]);
});

test('it leaves out a shown message that the product never indexed', async () => {
  const encoded: string[][] = [];

  const rated = await readRatedMessages(
    [{ caseID: 't2', query: 'what did I pack?', shownMessages: [{ sequence: 1 }] }],
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
