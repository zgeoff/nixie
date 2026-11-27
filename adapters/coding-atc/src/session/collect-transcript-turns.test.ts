import { expect, test } from 'bun:test';
import { collectTranscriptTurns } from './collect-transcript-turns';

test('it groups rows into turns and keeps the newest', () => {
  const turns = collectTranscriptTurns(
    [
      { role: 'user', text: 'a', tools: [] },
      { role: 'assistant', text: 'b', tools: [] },
      { role: 'user', text: 'c', tools: [] },
      { role: 'assistant', text: 'd', tools: [{ name: 'Bash', input: 'ls' }] },
      { role: 'assistant', text: 'e', tools: [] },
    ],
    1,
  );

  expect(turns).toStrictEqual([{ user: 'c', assistant: 'd\n\ne', tools: ['Bash: ls'] }]);
});

test('it gives rows before the first user row a turn with an empty user text', () => {
  expect(collectTranscriptTurns([{ role: 'assistant', text: 'hi', tools: [] }], 5)).toStrictEqual([
    { user: '', assistant: 'hi', tools: [] },
  ]);
});

test('it cuts a tool input past 200 characters', () => {
  const turns = collectTranscriptTurns(
    [{ role: 'assistant', text: 'x', tools: [{ name: 'Write', input: 'y'.repeat(300) }] }],
    1,
  );

  expect(turns[0]?.tools).toStrictEqual([`Write: ${'y'.repeat(200)}...`]);
});
