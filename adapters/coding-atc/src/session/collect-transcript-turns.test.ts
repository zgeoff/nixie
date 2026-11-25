import { expect, test } from 'bun:test';
import { collectTranscriptTurns } from './collect-transcript-turns';

test('it groups rows into turns and keeps the newest', () => {
  const turns = collectTranscriptTurns(
    [
      { role: 'user', text: 'a' },
      { role: 'assistant', text: 'b' },
      { role: 'user', text: 'c' },
      { role: 'assistant', text: 'd', tools: [{ name: 'Bash', summary: 'ls' }] },
      { role: 'assistant', text: 'e' },
    ],
    1,
  );

  expect(turns).toStrictEqual([{ user: 'c', assistant: 'd\n\ne', tools: ['Bash: ls'] }]);
});

test('it gives rows before the first user row a turn with an empty user text', () => {
  expect(collectTranscriptTurns([{ role: 'assistant', text: 'hi' }], 5)).toStrictEqual([
    { user: '', assistant: 'hi', tools: [] },
  ]);
});
