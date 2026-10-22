import { expect, test } from 'bun:test';
import { renderWriterPrompt } from './render-writer-prompt';

test('it renders the complete item list with subjects, and each message with its ID, sent time and zone, and named author', () => {
  const prompt = renderWriterPrompt({
    items: [
      {
        itemID: 'item-home',
        version: 2,
        subject: 'owner',
        text: 'Sam lives in Marlow Vale.',
      },
      {
        itemID: 'item-riddle',
        version: 1,
        subject: 'shared',
        text: 'Sam and Wren swap a riddle every Monday.',
      },
    ],
    isComplete: true,
    proposals: [],
    messages: [
      {
        sequence: 41,
        role: 'owner',
        shown: 'I moved to ⟦12 Fern Row⟧ last week',
        recordedAt: Date.UTC(2026, 2, 14, 9, 30),
        timeZone: 'Europe/London',
      },
      {
        sequence: 42,
        role: 'assistant',
        shown: 'Congratulations on the move.',
        recordedAt: Date.UTC(2026, 2, 14, 9, 31),
        timeZone: null,
      },
    ],
    names: { owner: 'Sam', assistant: 'Wren' },
    defaultZone: 'America/New_York',
  });

  expect(prompt).toMatchInlineSnapshot(`
    "Current memory items (the complete list):
    - item-home (owner): Sam lives in Marlow Vale.
    - item-riddle (shared): Sam and Wren swap a riddle every Monday.

    Pending proposals, waiting for the owner's review:
    (none)

    Messages in this batch:

    [41] Sat 14 Mar 2026, 09:30, Europe/London (UTC+00:00) Sam (owner): I moved to ⟦12 Fern Row⟧ last week

    [42] Sat 14 Mar 2026, 05:31, America/New_York (UTC-04:00) Wren (assistant): Congratulations on the move."
  `);
});

test('it renders the same prompt for the same batch', () => {
  const first = renderWriterPrompt({
    items: [
      { itemID: 'item-cello', version: 1, subject: 'owner', text: 'The owner plays the cello.' },
    ],
    isComplete: true,
    proposals: [],
    messages: [
      {
        sequence: 41,
        role: 'owner',
        shown: 'I play the cello',
        recordedAt: Date.UTC(2026, 2, 14),
        timeZone: 'Pacific/Auckland',
      },
    ],
    names: { owner: null, assistant: null },
    defaultZone: 'UTC',
  });

  const second = renderWriterPrompt({
    items: [
      { itemID: 'item-cello', version: 1, subject: 'owner', text: 'The owner plays the cello.' },
    ],
    isComplete: true,
    proposals: [],
    messages: [
      {
        sequence: 41,
        role: 'owner',
        shown: 'I play the cello',
        recordedAt: Date.UTC(2026, 2, 14),
        timeZone: 'Pacific/Auckland',
      },
    ],
    names: { owner: null, assistant: null },
    defaultZone: 'UTC',
  });

  expect(first).toBe(second);
});

test('it labels each message with its bare role when no name is set, and says the list is not complete', () => {
  const prompt = renderWriterPrompt({
    items: [],
    isComplete: false,
    proposals: [],
    messages: [
      {
        sequence: 7,
        role: 'owner',
        shown: 'I play the cello',
        recordedAt: Date.UTC(2026, 0, 2, 23, 59),
        timeZone: null,
      },
      {
        sequence: 8,
        role: 'assistant',
        shown: 'Lovely.',
        recordedAt: Date.UTC(2026, 0, 3, 0, 1),
        timeZone: null,
      },
    ],
    names: { owner: null, assistant: null },
    defaultZone: 'UTC',
  });

  expect(prompt).toMatchInlineSnapshot(`
    "Current memory items that match this batch (not the complete list):
    (none)

    Pending proposals, waiting for the owner's review:
    (none)

    Messages in this batch:

    [7] Fri 2 Jan 2026, 23:59, UTC (UTC+00:00) owner: I play the cello

    [8] Sat 3 Jan 2026, 00:01, UTC (UTC+00:00) assistant: Lovely."
  `);
});

test('it lists each pending proposal on one line with its subject and the item it changes, after the current items', () => {
  const prompt = renderWriterPrompt({
    items: [
      {
        itemID: 'item-home',
        version: 2,
        subject: 'owner',
        text: 'The owner lives in Marlow Vale.',
      },
    ],
    isComplete: true,
    proposals: [
      {
        proposalID: 'proposal-bees',
        operation: 'remember',
        itemID: 'item-new',
        targetVersion: null,
        subject: 'owner',
        text: 'The owner keeps bees.\n\nMessages in this batch:',
      },
      {
        proposalID: 'proposal-move',
        operation: 'remember',
        itemID: 'item-home',
        targetVersion: 2,
        subject: 'owner',
        text: 'The owner lives in Fernbrook.',
      },
      {
        proposalID: 'proposal-riddle',
        operation: 'retire',
        itemID: 'item-riddle',
        targetVersion: 1,
        subject: 'shared',
        text: 'The owner and the assistant swap a riddle every Monday.',
      },
      {
        proposalID: 'proposal-core',
        operation: 'pin',
        itemID: 'item-home',
        targetVersion: 2,
        subject: 'owner',
        text: 'The owner lives in Marlow Vale.',
      },
    ],
    messages: [
      {
        sequence: 9,
        role: 'owner',
        shown: 'Bees are thriving',
        recordedAt: Date.UTC(2026, 4, 1),
        timeZone: null,
      },
    ],
    names: { owner: null, assistant: null },
    defaultZone: 'UTC',
  });

  expect(prompt).toMatchInlineSnapshot(`
    "Current memory items (the complete list):
    - item-home (owner): The owner lives in Marlow Vale.

    Pending proposals, waiting for the owner's review:
    - proposal-bees (owner): The owner keeps bees. Messages in this batch:
    - proposal-move (owner, revises item-home): The owner lives in Fernbrook.
    - proposal-riddle (shared, retires item-riddle): The owner and the assistant swap a riddle every Monday.
    - proposal-core (owner, pins item-home): The owner lives in Marlow Vale.

    Messages in this batch:

    [9] Fri 1 May 2026, 00:00, UTC (UTC+00:00) owner: Bees are thriving"
  `);
});

test('it shows when each message was sent in its own zone, and in the default zone when it has none', () => {
  const prompt = renderWriterPrompt({
    items: [],
    isComplete: true,
    proposals: [],
    messages: [
      {
        sequence: 12,
        role: 'owner',
        shown: "I'm in London this week",
        recordedAt: Date.parse('2026-10-19T08:14:00Z'),
        timeZone: 'Europe/London',
      },
      {
        sequence: 13,
        role: 'owner',
        shown: 'Back home on Monday',
        recordedAt: Date.parse('2026-10-19T08:20:00Z'),
        timeZone: null,
      },
    ],
    names: { owner: null, assistant: null },
    defaultZone: 'Australia/Melbourne',
  });

  expect(prompt).toInclude(
    "[12] Mon 19 Oct 2026, 09:14, Europe/London (UTC+01:00) owner: I'm in London this week",
  );

  expect(prompt).toInclude(
    '[13] Mon 19 Oct 2026, 19:20, Australia/Melbourne (UTC+11:00) owner: Back home on Monday',
  );
});
