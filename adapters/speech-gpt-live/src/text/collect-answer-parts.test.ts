import { expect, test } from 'bun:test';
import { collectAnswerParts, maxPartChars } from './collect-answer-parts';

test('#collectAnswerParts keeps a short answer as one part', () => {
  expect(collectAnswerParts('You have two things. A dentist at nine.')).toStrictEqual([
    'You have two things. A dentist at nine.',
  ]);
});

test('#collectAnswerParts splits a long answer at the end of a sentence', () => {
  const sentence = `${'word '.repeat(60).trim()}. `;
  const parts = collectAnswerParts(sentence.repeat(10));

  expect(parts.length).toBeGreaterThan(1);
  expect(parts).toSatisfyAll((part: string) => part.length <= maxPartChars && part.endsWith('.'));
});

test('#collectAnswerParts splits a sentence longer than a part at a space', () => {
  const parts = collectAnswerParts('word '.repeat(600).trim());

  expect(parts).toSatisfyAll((part: string) => part.length <= maxPartChars && !part.includes('  '));
  expect(parts.join(' ')).toBe('word '.repeat(600).trim());
});
