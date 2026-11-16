import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { formatDefinitionRefusal } from './format-definition-refusal';

test('it names the head change of a replaced change', () => {
  const error = new ORPCError('REPLACED', {
    data: { head: { changeID: 'c-2', shortID: 'm7q2x9k4pa', operation: 'change' } },
  });

  expect(formatDefinitionRefusal(error)).toBe(
    'Change m7q2x9k4pa replaced this one. Undo that change instead.',
  );
});

test.each([
  ['NOT_FOUND', 'That change no longer exists.'],
  ['REPO_MOVED', 'The definitions repo changed this definition since. Change it there.'],
  ['NOT_IN_FORCE', 'This change is no longer in force.'],
  ['ONE_SHOT_OVER_REPO', 'A one-time trigger cannot go back over a definition in the repo.'],
  ['ONE_SHOT_PAST', 'The time of that one-time trigger has passed.'],
])('it words the %s refusal', (code, sentence) => {
  expect(formatDefinitionRefusal(new ORPCError(code))).toBe(sentence);
});

test('it tells the owner to try again for an error it does not know', () => {
  expect(formatDefinitionRefusal(new Error('offline'))).toBe('The undo did not finish. Try again.');
});
