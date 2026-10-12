import { expect, test } from 'bun:test';
import { SAMPLES } from './cases.ts';
import { buildCheckerInput } from './run.ts';

const PAIRS = SAMPLES.flatMap((sample) =>
  sample.pairs.map((pair) => ({ message: sample.message, name: `${sample.id}: ${pair.memory}`, pair })),
);

test.each(PAIRS)('#buildCheckerInput accepts $name, which passes the code checks', (entry) => {
  expect(() => buildCheckerInput(entry.message, entry.pair)).not.toThrow();
});

test('#buildCheckerInput marks the quote and each pasted span', () => {
  const sample = SAMPLES.find((entry) => entry.id === 'landlord');
  if (sample === undefined) {
    throw new Error('no landlord sample');
  }
  const pair = sample.pairs[0];
  if (pair === undefined) {
    throw new Error('no landlord pair');
  }
  expect(buildCheckerInput(sample.message, pair)).toBe(
    '<owner_message>\n«quote»my landlord sent this«/quote», is it legit?\n\n' +
      '«pasted»Your rent rises to £1,450 a month from 1 November.«/pasted»\n</owner_message>\n\n' +
      "<candidate_memory>\nThe owner's rent is £1,450 a month from 1 November.\n</candidate_memory>",
  );
});
