import { expect, test } from 'bun:test';
import { buildGrantPath } from './build-grant-path';

test('#buildGrantPath limits a model grant to its sandbox and route', () => {
  expect(buildGrantPath('nixie-abc', 'claude-main')).toBe('/nixie-abc/claude-main/**');
});

test('#buildGrantPath limits a grant with no route to its sandbox', () => {
  expect(buildGrantPath('nixie-abc', null)).toBe('/nixie-abc/**');
});
