import { expect, test } from 'bun:test';
import { renderWriterPrompt } from './render-writer-prompt';

test('it renders the complete item list and each message with its ID, date and role', () => {
  const prompt = renderWriterPrompt({
    items: [
      { itemID: 'item-home', version: 2, text: 'The owner lives in Marlow Vale.' },
      { itemID: 'item-cello', version: 1, text: 'The owner plays the cello.' },
    ],
    isComplete: true,
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

    Messages in this batch:

    [41] 2026-03-14 owner: I moved to ⟦12 Fern Row⟧ last week

    [42] 2026-03-14 assistant: Congratulations on the move."
  `);
});

test('it renders the same prompt for the same batch', () => {
  const first = renderWriterPrompt({
    items: [{ itemID: 'item-cello', version: 1, text: 'The owner plays the cello.' }],
    isComplete: true,
    messages: [
      { sequence: 41, role: 'owner', shown: 'I play the cello', recordedAt: Date.UTC(2026, 2, 14) },
    ],
  });
  const second = renderWriterPrompt({
    items: [{ itemID: 'item-cello', version: 1, text: 'The owner plays the cello.' }],
    isComplete: true,
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

    Messages in this batch:

    [7] 2026-01-02 owner: I play the cello"
  `);
});
