import { expect, test } from 'bun:test';
import { renderMemoryChangeNote } from './render-memory-change-note';

test('it renders the changes, the catch-up count and how many more', () => {
  const note = renderMemoryChangeNote({
    changes: [
      { shortID: 'item-home', change: 'changed', text: 'The owner lives in Marlow Vale.' },
      { shortID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' },
      { shortID: 'item-bike', change: 'retired', text: 'The owner rides a red bike.' },
    ],
    moreCount: 4,
    catchUpCount: 3,
    merges: [],
  });

  expect(note).toMatchInlineSnapshot(`
    "Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    - Took in 3 things from earlier conversation
    - Changed [item-home]: The owner lives in Marlow Vale.
    - Remembered [item-cello]: The owner plays the cello.
    - Retired [item-bike]: The owner rides a red bike.
    and 4 more"
  `);
});

test('it heads a replay with the turns it covers, not the time since the last turn', () => {
  const note = renderMemoryChangeNote({
    changes: [{ shortID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 0,
    catchUpCount: 0,
    merges: [],
    isReplay: true,
  });

  expect(note).toBe(
    [
      'Memory changed over the recent turns above, outside this conversation. Where these differ from anything said earlier, these hold.',
      '- Remembered [item-cello]: The owner plays the cello.',
    ].join('\n'),
  );
});

test('it renders the same note for the same changes', () => {
  const first = renderMemoryChangeNote({
    changes: [{ shortID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 1,
    catchUpCount: 2,
    merges: [],
  });
  const second = renderMemoryChangeNote({
    changes: [{ shortID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 1,
    catchUpCount: 2,
    merges: [],
  });

  expect(first).toBe(second);
});

test('it counts one catch-up item in the singular', () => {
  const note = renderMemoryChangeNote({ changes: [], moreCount: 0, catchUpCount: 1, merges: [] });

  expect(note).toMatchInlineSnapshot(`
    "Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    - Took in 1 thing from earlier conversation"
  `);
});

test('it leaves out the catch-up and the more lines when neither has anything', () => {
  const note = renderMemoryChangeNote({
    changes: [{ shortID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 0,
    catchUpCount: 0,
    merges: [],
  });

  expect(note).toMatchInlineSnapshot(`
    "Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    - Remembered [item-cello]: The owner plays the cello."
  `);
});

test('it renders a note with only a count of more changes', () => {
  const note = renderMemoryChangeNote({ changes: [], moreCount: 2, catchUpCount: 0, merges: [] });

  expect(note).toMatchInlineSnapshot(`
    "Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    and 2 more"
  `);
});

test('it renders nothing when nothing changed', () => {
  expect(
    renderMemoryChangeNote({ changes: [], moreCount: 0, catchUpCount: 0, merges: [] }),
  ).toBeNull();
});

test("it notes each merge into the conversation's own proposal after the changes", () => {
  const note = renderMemoryChangeNote({
    changes: [{ shortID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 0,
    catchUpCount: 0,
    merges: [{ proposalID: 'proposal-bees', origin: 'memory_writer' }],
  });

  expect(note).toMatchInlineSnapshot(`
    "Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    - Remembered [item-cello]: The owner plays the cello.
    - The memory writer proposed the same memory again; it merged into your pending proposal [proposal-bees], which still waits for the owner's review"
  `);
});

test('it renders a note that holds only a merge', () => {
  const note = renderMemoryChangeNote({
    changes: [],
    moreCount: 0,
    catchUpCount: 0,
    merges: [{ proposalID: 'proposal-bees', origin: 'task' }],
  });

  expect(note).toInclude('- A task proposed the same memory again');
});
