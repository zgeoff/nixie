import { expect, test } from 'bun:test';
import { renderTurnPreamble } from './render-turn-preamble';

test('it renders the continuation note, the change note, the facts, the self-notes, the past messages and the task board in that order', () => {
  const fact = {
    itemID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
    shortID: 'h4ns8w1cpe',
    subject: 'owner',
    version: 1,
    origin: 'owner',
    source: 'owner',
    model: null,
    recordedAt: Date.UTC(2026, 8, 14, 18, 0),
    text: 'Plays the cello on Sundays',
    evidenceQuote: null,
    approval: null,
  } as const;

  const preamble = renderTurnPreamble(
    {
      continuation: 'Continue the work.',
      changes: '- Unpinned [r2vd6t0jmy]',
      retrieval: {
        items: [fact],
        selfNotes: [{ ...fact, subject: 'self', model: 'claude-opus-5-5', text: 'I enjoy a pun' }],
        messages: [
          {
            sequence: 4812,
            thread: 'garden',
            recordedAt: Date.UTC(2026, 9, 13, 9, 30),
            text: 'The tomatoes need staking',
            isCut: false,
          },
        ],
      },
      thread: 'garden',
      at: 'Wed 14 Oct, 12:00, UTC',
      brief: null,
    },
    { ownerName: 'Sam', defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
  );

  expect(
    preamble.map((block) => /^<system-message type="(?<type>[\w-]+)"/u.exec(block)?.[1]),
  ).toStrictEqual([
    'task-continue',
    'pinned-memory-changes',
    'retrieved-memory',
    'retrieved-self-notes',
    'retrieved-messages',
  ]);
});

test('it leaves out each block with nothing in it', () => {
  expect(
    renderTurnPreamble(
      {
        continuation: null,
        changes: null,
        retrieval: { items: [], selfNotes: [], messages: [] },
        thread: 'garden',
        at: 'Wed 14 Oct, 12:00, UTC',
        brief: null,
      },
      { ownerName: null, defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
    ),
  ).toStrictEqual([]);
});

test('it puts the brief that sits in no inbox record last', () => {
  const preamble = renderTurnPreamble(
    {
      continuation: 'Continue the work.',
      changes: null,
      retrieval: { items: [], selfNotes: [], messages: [] },
      thread: 'garden',
      at: 'Wed 14 Oct, 12:00, UTC',
      brief: '<task-message id="t4m2">Find quiet cafes.</task-message>',
    },
    { ownerName: null, defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
  );

  expect(preamble.at(-1)).toBe('<task-message id="t4m2">Find quiet cafes.</task-message>');
  expect(preamble).toHaveLength(2);
});
