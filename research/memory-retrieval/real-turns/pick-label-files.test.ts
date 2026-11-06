import { expect, test } from 'bun:test';
import { pickLabelFiles } from './pick-label-files.ts';

test('it keeps only the .jsonl files, in name order', () => {
  expect(pickLabelFiles(['part-02.jsonl', 'notes.md', 'part-01.jsonl', 'part-03.json'])).toStrictEqual(['part-01.jsonl', 'part-02.jsonl']);
});
