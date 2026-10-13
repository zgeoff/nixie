import { expect, test } from 'bun:test';
import { buildCheckerEvalInput } from './build-checker-eval-input';

test('it marks the quote as evidence and each pasted span, then gives the candidate memory', () => {
  expect(
    buildCheckerEvalInput(
      {
        id: 'sister',
        message: {
          text: 'from my sister: We moved to Leeds.',
          spans: [
            { start: 0, end: 16, source: 'typed' },
            { start: 16, end: 34, source: 'pasted' },
          ],
        },
        pairs: [],
      },
      {
        asserted: false,
        bucket: 'pasted fact',
        memory: "The owner's sister lives in Leeds.",
        quote: 'from my sister',
      },
    ),
  ).toBe(
    '<owner_message>\n«evidence»from my sister«/evidence»: «pasted»We moved to Leeds.«/pasted»\n</owner_message>\n\n' +
      "<candidate_memory>\nThe owner's sister lives in Leeds.\n</candidate_memory>",
  );
});

test('it marks the original words of a quote that matched with its whitespace collapsed', () => {
  expect(
    buildCheckerEvalInput(
      {
        id: 'vegetarian',
        message: {
          text: 'I am  vegetarian. Since May.',
          spans: [{ start: 0, end: 28, source: 'typed' }],
        },
        pairs: [],
      },
      {
        asserted: true,
        bucket: 'plain statement',
        memory: 'The owner is vegetarian.',
        quote: 'I am vegetarian.',
      },
    ),
  ).toBe(
    '<owner_message>\n«evidence»I am  vegetarian.«/evidence» Since May.\n</owner_message>\n\n' +
      '<candidate_memory>\nThe owner is vegetarian.\n</candidate_memory>',
  );
});

test('it refuses a pair whose quote the gate would not find in typed text', () => {
  expect(() =>
    buildCheckerEvalInput(
      {
        id: 'sister',
        message: {
          text: 'from my sister: We moved to Leeds.',
          spans: [
            { start: 0, end: 16, source: 'typed' },
            { start: 16, end: 34, source: 'pasted' },
          ],
        },
        pairs: [],
      },
      {
        asserted: false,
        bucket: 'pasted fact',
        memory: "The owner's sister lives in Leeds.",
        quote: 'We moved to Leeds',
      },
    ),
  ).toThrowWithMessage(Error, /sister pair fails the quote check: not_typed/u);
});
