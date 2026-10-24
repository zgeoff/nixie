import { expect, test } from 'bun:test';
import { buildSample } from './build-sample.ts';

test('it keeps each retrieving turn, fills to the size and shows only the items retrieval could return', () => {
  const sample = buildSample(
    [
      {
        caseID: 't3',
        stepSequence: 2,
        recalledSequence: 3,
        recordedAt: 0,
        query: 'what should I pack?',
        reply: 'Pack light.',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, text: 'Packs light' },
          { itemID: 'item-b', version: 1, isSelf: false, isPinned: true, isLapsed: false, text: 'Lives in Hobart' },
          { itemID: 'item-c', version: 2, isSelf: false, isPinned: false, isLapsed: false, text: 'Flies on Friday' },
        ],
        logged: [{ itemID: 'item-a', version: 1 }],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
      {
        caseID: 't8',
        stepSequence: 7,
        recalledSequence: 8,
        recordedAt: 0,
        query: 'and the weather?',
        reply: 'Mild.',
        earlier: [{ owner: 'what should I pack?', reply: 'Pack light.' }],
        candidates: [
          { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, text: 'Packs light' },
          { itemID: 'item-d', version: 1, isSelf: false, isPinned: false, isLapsed: true, text: 'Hotel booked until May' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
      {
        caseID: 't12',
        stepSequence: 11,
        recalledSequence: 12,
        recordedAt: 0,
        query: 'thanks',
        reply: 'Any time.',
        earlier: [],
        candidates: [{ itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, text: 'Packs light' }],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    2,
  );

  expect(sample).toMatchInlineSnapshot(`
    {
      "kept": 1,
      "keys": [
        {
          "caseID": "t3",
          "refs": {
            "M1": "item-c",
            "M2": "item-a",
          },
        },
        {
          "caseID": "t8",
          "refs": {
            "M1": "item-a",
          },
        },
      ],
      "turns": [
        {
          "caseID": "t3",
          "earlier": [],
          "items": [
            {
              "ref": "M1",
              "text": "Flies on Friday",
            },
            {
              "ref": "M2",
              "text": "Packs light",
            },
          ],
          "message": "what should I pack?",
          "reply": "Pack light.",
        },
        {
          "caseID": "t8",
          "earlier": [
            {
              "owner": "what should I pack?",
              "reply": "Pack light.",
            },
          ],
          "items": [
            {
              "ref": "M1",
              "text": "Packs light",
            },
          ],
          "message": "and the weather?",
          "reply": "Mild.",
        },
      ],
    }
  `);
});

test('it builds the same sample from the same turns', () => {
  const turns = [
    {
      caseID: 't3',
      stepSequence: 2,
      recalledSequence: 3,
      recordedAt: 0,
      query: 'what should I pack?',
      reply: 'Pack light.',
      earlier: [],
      candidates: [
        { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, text: 'Packs light' },
        { itemID: 'item-c', version: 2, isSelf: false, isPinned: false, isLapsed: false, text: 'Flies on Friday' },
        { itemID: 'item-e', version: 1, isSelf: true, isPinned: false, isLapsed: false, text: 'Keeps replies short' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
  ];

  expect(buildSample(turns, null)).toStrictEqual(buildSample(turns, null));
});
