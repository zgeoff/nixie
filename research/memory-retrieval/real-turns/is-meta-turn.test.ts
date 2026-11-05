import { expect, test } from 'bun:test';
import { isMetaTurn } from './is-meta-turn.ts';

test.each([
  ['a message about the retriever', 'why did the retriever pick that?', 'No idea.'],
  ['a reply about what was retrieved', 'ok', 'This turn I retrieved your note on the ferry.'],
  ['a message about a memory batch', 'look at the memory batch', 'Done.'],
  ['a message about being spammed', 'you get spammed every turn', 'I do.'],
])('it flags %s', (_name, query, reply) => {
  expect(isMetaTurn({ query, reply })).toBe(true);
});

test.each([
  ['a turn about the weather', 'is it cold out?', 'Very.'],
  ['a turn about a golden retriever', 'we met a golden retriever', 'Lucky you.'],
])('it leaves %s alone', (_name, query, reply) => {
  expect(isMetaTurn({ query, reply })).toBe(false);
});
