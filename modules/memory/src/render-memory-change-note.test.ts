import { expect, test } from 'bun:test';
import { renderMemoryChangeNote } from './render-memory-change-note';

test('it renders the changes, the catch-up count and how many more', () => {
  const note = renderMemoryChangeNote({
    changes: [
      { itemID: 'item-home', change: 'changed', text: 'The owner lives in Marlow Vale.' },
      { itemID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' },
      { itemID: 'item-bike', change: 'retired', text: 'The owner rides a red bike.' },
    ],
    moreCount: 4,
    catchUpCount: 3,
  });

  expect(note).toMatchInlineSnapshot(`
    "<memory-changes>
    Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    - Took in 3 things from earlier conversation
    - Changed [item-home]: The owner lives in Marlow Vale.
    - Remembered [item-cello]: The owner plays the cello.
    - Retired [item-bike]: The owner rides a red bike.
    and 4 more
    </memory-changes>"
  `);
});

test('it renders the same note for the same changes', () => {
  const first = renderMemoryChangeNote({
    changes: [{ itemID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 1,
    catchUpCount: 2,
  });
  const second = renderMemoryChangeNote({
    changes: [{ itemID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 1,
    catchUpCount: 2,
  });

  expect(first).toBe(second);
});

test('it counts one catch-up item in the singular', () => {
  const note = renderMemoryChangeNote({ changes: [], moreCount: 0, catchUpCount: 1 });

  expect(note).toMatchInlineSnapshot(`
    "<memory-changes>
    Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    - Took in 1 thing from earlier conversation
    </memory-changes>"
  `);
});

test('it leaves out the catch-up and the more lines when neither has anything', () => {
  const note = renderMemoryChangeNote({
    changes: [{ itemID: 'item-cello', change: 'remembered', text: 'The owner plays the cello.' }],
    moreCount: 0,
    catchUpCount: 0,
  });

  expect(note).toMatchInlineSnapshot(`
    "<memory-changes>
    Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    - Remembered [item-cello]: The owner plays the cello.
    </memory-changes>"
  `);
});

test('it renders a note with only a count of more changes', () => {
  const note = renderMemoryChangeNote({ changes: [], moreCount: 2, catchUpCount: 0 });

  expect(note).toMatchInlineSnapshot(`
    "<memory-changes>
    Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.
    and 2 more
    </memory-changes>"
  `);
});

test('it renders nothing when nothing changed', () => {
  expect(renderMemoryChangeNote({ changes: [], moreCount: 0, catchUpCount: 0 })).toBeNull();
});
