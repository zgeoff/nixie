import { expect, test } from 'bun:test';
import { memoryKillsPath } from '../memory-kills-path';
import { buildMockSandbox } from './build-mock-sandbox';
import { writeMemoryKills } from './write-memory-kills';

test('#writeMemoryKills copies the count into the sandbox as text', async () => {
  const copies: { path: string; text: string }[] = [];

  const sandbox = buildMockSandbox({
    copyIn: (files) => {
      for (const file of files) {
        copies.push({ path: file.path, text: new TextDecoder().decode(file.content) });
      }

      return Promise.resolve();
    },
  });

  await writeMemoryKills(sandbox, 7);

  expect(copies).toStrictEqual([{ path: memoryKillsPath, text: '7' }]);
});

test.each([
  [-1],
  [1.5],
  [Number.NaN],
  [1e21],
  [Number.MAX_SAFE_INTEGER + 1],
  [Number.POSITIVE_INFINITY],
])('#writeMemoryKills refuses %d', (kills) => {
  expect(() => writeMemoryKills(buildMockSandbox(), kills)).toThrow();
});
