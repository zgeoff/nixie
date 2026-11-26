import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNameLeaks } from './read-name-leaks';

test('it reads names from the source of a core package, and skips tests and the named files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nixie-leaks-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'modules/log/src/test-utils'), { recursive: true });
  await writeFile(join(root, 'modules/log/src/a.ts'), "const kind = 'google';\n");
  await writeFile(join(root, 'modules/log/src/b.ts'), "const kind = 'mcp';\n");
  await writeFile(join(root, 'modules/log/src/a.test.ts'), "const kind = 'google';\n");
  await writeFile(join(root, 'modules/log/src/test-utils/c.ts'), "const kind = 'google';\n");

  const leaks = await readNameLeaks(
    root,
    ['modules/log'],
    ['google', 'mcp'],
    ['modules/log/src/b.ts'],
  );

  expect(leaks).toStrictEqual([{ file: 'modules/log/src/a.ts', name: 'google' }]);
});
