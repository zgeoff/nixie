import { expect, test } from 'bun:test';
import { SAMPLES } from './cases.ts';
import {
  buildCheckerInput,
  buildRunConfig,
  buildSystemPrompt,
  findConfigMismatch,
  loadRecords,
} from './run.ts';

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

const HAIKU_QUOTE = new URL('results/haiku-5-5.jsonl', import.meta.url).pathname;

test('#findConfigMismatch accepts records from the same model, mark and prompt', () => {
  const config = buildRunConfig('claude-haiku-5-5', 'quote', buildSystemPrompt('quote'));
  expect(findConfigMismatch(loadRecords(HAIKU_QUOTE), config)).toBeUndefined();
});

test('#findConfigMismatch names the first field that differs from another run', () => {
  const config = buildRunConfig('claude-sonnet-5-5', 'evidence', buildSystemPrompt('evidence'));
  expect(findConfigMismatch(loadRecords(HAIKU_QUOTE), config)).toBe(
    'model claude-haiku-5-5, not claude-sonnet-5-5',
  );
});

test('#findConfigMismatch rejects records written under another prompt', () => {
  const config = buildRunConfig('claude-haiku-5-5', 'quote', `${buildSystemPrompt('quote')}\n`);
  expect(findConfigMismatch(loadRecords(HAIKU_QUOTE), config)).toStartWith('promptSHA256 ');
});
