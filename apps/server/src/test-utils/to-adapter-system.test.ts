import { expect, test } from 'bun:test';
import { toAdapterSystem } from './to-adapter-system';

test.each([
  { folder: 'image-gemini', system: 'gemini' },
  { folder: 'definitions-repo-github', system: 'repo-github' },
])('it reads the system of the adapter $folder as $system', (row) => {
  expect(toAdapterSystem(row.folder)).toBe(row.system);
});
