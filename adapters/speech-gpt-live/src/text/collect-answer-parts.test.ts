import { expect, test } from 'bun:test';
import { maxPartTokens } from '../constants';
import { collectAnswerParts } from './collect-answer-parts';
import { estimateTokens } from './estimate-tokens';

test('#collectAnswerParts keeps a short answer as one part', () => {
  expect(collectAnswerParts('You have two things. A dentist at nine.')).toStrictEqual([
    'You have two things. A dentist at nine.',
  ]);
});

test('#collectAnswerParts splits a long answer at the end of a sentence', () => {
  const sentence = `${'word '.repeat(60).trim()}. `;
  const parts = collectAnswerParts(sentence.repeat(10));

  expect(parts.length).toBeGreaterThan(1);

  expect(parts).toSatisfyAll(
    (part: string) => estimateTokens(part) <= maxPartTokens && part.endsWith('.'),
  );
});

test('#collectAnswerParts splits a sentence longer than a part at a space', () => {
  const parts = collectAnswerParts('word '.repeat(600).trim());

  expect(parts).toSatisfyAll(
    (part: string) => estimateTokens(part) <= maxPartTokens && !part.includes('  '),
  );

  expect(parts.join(' ')).toBe('word '.repeat(600).trim());
});

test('#collectAnswerParts keeps the marks that open a long answer', () => {
  const text = `... abc ${'abc '.repeat(600)}`.trim();
  const parts = collectAnswerParts(text);

  expect(parts.join(' ')).toBe(text);
  expect(parts[0]?.startsWith('... abc abc')).toBeTrue();
});

test('#collectAnswerParts keeps a long text with no space inside the token limit', () => {
  const text = '予定'.repeat(500);
  const parts = collectAnswerParts(text);

  expect(parts.length).toBeGreaterThan(1);
  expect(parts).toSatisfyAll((part: string) => estimateTokens(part) <= maxPartTokens);
  expect(parts.join('')).toBe(text);
});
