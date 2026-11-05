import { expect, test } from 'bun:test';
import { findOutFolderError } from './find-out-folder-error.ts';

test('it accepts an empty or new folder', () => {
  expect(findOutFolderError('samples/march', [])).toBeNull();
});

test('it rejects a folder that holds an earlier sample part', () => {
  expect(findOutFolderError('samples/march', ['part-03.md'])).toBe('pass an empty or new --out folder: samples/march already holds 1 files');
});
