import { expect, test } from 'bun:test';
import { requireBackupSetMove } from './backup-set-moves';

test.each([
  ['staging', 'staged'],
  ['staging', 'abandoned'],
  ['staged', 'published'],
  ['staged', 'failed'],
  ['staged', 'abandoned'],
] as const)('it allows a set to move from %s to %s', (from, to) => {
  expect(() => {
    requireBackupSetMove(from, to);
  }).not.toThrow();
});

test('it refuses to move a published set again', () => {
  expect(() => {
    requireBackupSetMove('published', 'failed');
  }).toThrowWithMessage(
    Error,
    'a backup set moves from published only to nothing, never to failed',
  );
});

test('it refuses a receipt for a set whose copy never finished', () => {
  expect(() => {
    requireBackupSetMove('staging', 'published');
  }).toThrowWithMessage(
    Error,
    'a backup set moves from staging only to staged or abandoned, never to published',
  );
});
