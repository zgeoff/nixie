import { expect, test } from 'bun:test';
import { toRecordingsDir } from './to-recordings-dir.ts';

test('it names the recordings folder after the output file', () => {
  expect(toRecordingsDir('results/imp/reply-grok.jsonl')).toBe('results/imp/recordings/reply-grok');
});

test('it gives two output files of one candidate two folders', () => {
  expect(toRecordingsDir('results/first.jsonl')).not.toBe(toRecordingsDir('results/second.jsonl'));
});
