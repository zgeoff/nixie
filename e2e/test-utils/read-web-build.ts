import { join } from 'node:path';
import { createRunTemplate } from '@heynixie/testing';
import { runWebBuild } from '@heynixie/web/test-utils';

const repoRoot = join(import.meta.dir, '..', '..');

// A web build takes longer than a test's limit on a host with 2 cores, so the e2e lane fills the
// template before its tests start, and each suite reads it.
export async function readWebBuild(): Promise<string> {
  const directory = await createRunTemplate({
    name: 'nixie-web-build',
    root: repoRoot,
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-test-bundles'),
    inputs: ['apps/web/**/*', 'libs/*/src/**/*', '*/*/package.json', 'bun.lock'],
    write: (building) => runWebBuild(building),
  });

  return join(directory, 'server', 'server.js');
}

if (import.meta.main) {
  await readWebBuild();
}
