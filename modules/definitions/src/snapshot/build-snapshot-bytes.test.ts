import { expect, test } from 'bun:test';
import { buildSnapshotBytes } from './build-snapshot-bytes';

test('it counts the base files with each written file in place of its old size, and drops each removed file', () => {
  expect(
    buildSnapshotBytes(
      new Map([
        ['nixie.yaml', 100],
        ['prompts/old.md', 40],
        ['prompts/kept.md', 7],
      ]),
      new Map([
        ['nixie.yaml', 'format: 3\n'],
        ['prompts/old.md', null],
        ['prompts/new.md', 'Keep it short.\n'],
      ]),
    ),
  ).toBe(10 + 7 + 15);
});

test('it leaves out a file that the definitions source never reads', () => {
  expect(
    buildSnapshotBytes(new Map([['README.md', 500]]), new Map([['nixie.yaml', 'format: 3\n']])),
  ).toBe(10);
});
