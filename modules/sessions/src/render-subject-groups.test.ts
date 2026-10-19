import { expect, test } from 'bun:test';
import { renderSubjectGroups } from './render-subject-groups';

test('it renders each subject under its own heading, shared after the owner and self last', () => {
  const lines = renderSubjectGroups(
    [
      {
        itemID: '7c1d9e2a-4b6f-4a83-9d05-3e8f1a2b6c47',
        shortID: 'q4wz8n2kpa',
        subject: 'self',
        model: 'claude-opus-5-5',
        version: 1,
        origin: 'conversation',
        source: 'untrusted',
        recordedAt: Date.UTC(2026, 9, 13, 9, 30),
        text: 'I like a story that ends on a small joke',
        evidenceQuote: null,
        approval: { isQuotePasted: false },
      },
      {
        itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
        shortID: 'b7kq2m9xza',
        subject: 'shared',
        model: null,
        version: 1,
        origin: 'memory_writer',
        source: 'owner',
        recordedAt: Date.UTC(2026, 9, 12, 9, 30),
        text: 'Robin and the assistant call the kettle Captain Steam',
        evidenceQuote: 'ask Captain Steam',
        approval: null,
      },
      {
        itemID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
        shortID: 'h4ns8w1cpe',
        subject: 'owner',
        model: null,
        version: 2,
        origin: 'owner',
        source: 'owner',
        recordedAt: Date.UTC(2026, 8, 14, 18, 0),
        text: 'Plays the cello on Sundays',
        evidenceQuote: null,
        approval: null,
      },
    ],
    { ownerName: 'Robin', defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
  );

  expect(lines.join('\n')).toMatchInlineSnapshot(`
    "About Robin:
    - Plays the cello on Sundays
      h4ns8w1cpe v2 · 14 Sep · Robin said this
    Between you and Robin:
    - Robin and the assistant call the kettle Captain Steam
      b7kq2m9xza v1 · 12 Oct · the note-taker noted it · Robin said this
      How it came up: "ask Captain Steam"
    About yourself, in your own words:
    - I like a story that ends on a small joke
      q4wz8n2kpa v1 · 13 Oct · you noted it · unconfirmed · Robin approved"
  `);
});

test('it leaves out the heading of a subject with no item', () => {
  const lines = renderSubjectGroups(
    [
      {
        itemID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
        shortID: 'h4ns8w1cpe',
        subject: 'owner',
        model: null,
        version: 1,
        origin: 'owner',
        source: 'owner',
        recordedAt: Date.UTC(2026, 8, 14, 18, 0),
        text: 'Plays the cello on Sundays',
        evidenceQuote: null,
        approval: null,
      },
    ],
    { ownerName: null, defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
  );

  expect(lines).toStrictEqual([
    'About the owner:',
    '- Plays the cello on Sundays',
    '  h4ns8w1cpe v1 · 14 Sep · the owner said this',
  ]);
});
