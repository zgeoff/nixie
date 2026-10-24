import { expect, test } from 'bun:test';
import { toRecordingsDir } from './to-recordings-dir.ts';

test('it names the recordings folder after the whole output file name', () => {
  expect(toRecordingsDir('results/imp/reply-grok.jsonl')).toBe('results/imp/recordings/reply-grok.jsonl');
});

test('it gives two output files of one candidate two folders', () => {
  expect(toRecordingsDir('results/first.jsonl')).not.toBe(toRecordingsDir('results/second.jsonl'));
});

test('it gives two output files that differ only in their extension two folders', () => {
  expect(toRecordingsDir('results/run.jsonl')).not.toBe(toRecordingsDir('results/run.ndjson'));
});
