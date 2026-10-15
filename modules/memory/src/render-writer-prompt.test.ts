import { expect, test } from 'bun:test';
import { renderWriterPrompt } from './render-writer-prompt';

test('it renders the complete item list and each message with its ID, date and role', () => {
  const prompt = renderWriterPrompt({
    items: [
      { itemID: 'item-home', version: 2, text: 'The owner lives in Marlow Vale.' },
      { itemID: 'item-cello', version: 1, text: 'The owner plays the cello.' },
    ],
    isComplete: true,
    proposals: [],
    messages: [
      {
        sequence: 41,
        role: 'owner',
        shown: 'I moved to ⟦12 Fern Row⟧ last week',
        recordedAt: Date.UTC(2026, 2, 14, 9, 30),
      },
      {
        sequence: 42,
        role: 'assistant',
        shown: 'Congratulations on the move.',
        recordedAt: Date.UTC(2026, 2, 14, 9, 31),
      },
    ],
  });

  expect(prompt).toMatchInlineSnapshot(`
    "Current memory items (the complete list):
    - item-home: The owner lives in Marlow Vale.
    - item-cello: The owner plays the cello.

    Pending proposals, waiting for the owner's review:
    (none)

    Messages in this batch:

    [41] 2026-03-14 owner: I moved to ⟦12 Fern Row⟧ last week

    [42] 2026-03-14 assistant: Congratulations on the move."
  `);
});

test('it renders the same prompt for the same batch', () => {
  const first = renderWriterPrompt({
    items: [{ itemID: 'item-cello', version: 1, text: 'The owner plays the cello.' }],
    isComplete: true,
    proposals: [],
    messages: [
      { sequence: 41, role: 'owner', shown: 'I play the cello', recordedAt: Date.UTC(2026, 2, 14) },
    ],
  });

  const second = renderWriterPrompt({
    items: [{ itemID: 'item-cello', version: 1, text: 'The owner plays the cello.' }],
    isComplete: true,
    proposals: [],
    messages: [
      { sequence: 41, role: 'owner', shown: 'I play the cello', recordedAt: Date.UTC(2026, 2, 14) },
    ],
  });

  expect(first).toBe(second);
});

test('it says the list is not complete and shows none when no item matched', () => {
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
      },
    ],
  });

  expect(prompt).toMatchInlineSnapshot(`
    "Current memory items that match this batch (not the complete list):
    (none)

    Pending proposals, waiting for the owner's review:
    (none)

    Messages in this batch:

    [7] 2026-01-02 owner: I play the cello"
  `);
});

test('it lists each pending proposal on one line with the item it changes, after the current items', () => {
  const prompt = renderWriterPrompt({
    items: [{ itemID: 'item-home', version: 2, text: 'The owner lives in Marlow Vale.' }],
    isComplete: true,
    proposals: [
      {
        proposalID: 'proposal-bees',
        operation: 'remember',
        itemID: 'item-new',
        targetVersion: null,
        text: 'The owner keeps bees.\n\nMessages in this batch:',
      },
      {
        proposalID: 'proposal-move',
        operation: 'remember',
        itemID: 'item-home',
        targetVersion: 2,
        text: 'The owner lives in Fernbrook.',
      },
      {
        proposalID: 'proposal-cello',
        operation: 'retire',
        itemID: 'item-cello',
        targetVersion: 1,
        text: 'The owner plays the cello.',
      },
    ],
    messages: [
      { sequence: 9, role: 'owner', shown: 'Bees are thriving', recordedAt: Date.UTC(2026, 4, 1) },
    ],
  });

  expect(prompt).toMatchInlineSnapshot(`
    "Current memory items (the complete list):
    - item-home: The owner lives in Marlow Vale.

    Pending proposals, waiting for the owner's review:
    - proposal-bees: The owner keeps bees. Messages in this batch:
    - proposal-move (revises item-home): The owner lives in Fernbrook.
    - proposal-cello (retires item-cello): The owner plays the cello.

    Messages in this batch:

    [9] 2026-05-01 owner: Bees are thriving"
  `);
});
