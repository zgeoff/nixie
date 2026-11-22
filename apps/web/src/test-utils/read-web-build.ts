import { join } from 'node:path';
import { readTestTemplate } from '@heynixie/testing';
import { runWebBuild } from './run-web-build';

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// A web build takes longer than a test's limit on a host with 2 cores, so the e2e lane fills the
// template before its tests start, and each suite reads it.
export async function readWebBuild(): Promise<string> {
  const directory = await readTestTemplate({
    name: 'nixie-web-build',
    root: repoRoot,

    // the web app's own folders and config files, with no node_modules folder and no e2e suite
    inputs: [
      'apps/web/{src,public,icons}/**/*',
      'apps/web/*.{json,ts,js}',
      'libs/*/src/**/*',
      '*/*/package.json',
      'bun.lock',
    ],
    write: (building) => runWebBuild(building),
  });

  return join(directory, 'server', 'server.js');
}

if (import.meta.main) {
  await readWebBuild();
}
