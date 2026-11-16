import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { codexVersion } from './codex-version';

test('it pins the CLI version that the Dockerfile downloads', async () => {
  const dockerfile = await readFile(join(import.meta.dir, '..', 'Dockerfile'), 'utf8');

  expect(dockerfile).toInclude(`/releases/download/rust-v${codexVersion}/`);
});
