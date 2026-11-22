import { join } from 'node:path';
import { readTestTemplate } from '@heynixie/testing';
import { writeGuestBundles } from '../write-guest-bundles';
import { resolveInstalledCLIPath } from './resolve-installed-cli-path';

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// The suites run the guest as the image does, from its bundles, so the Agent SDK lane fills the
// template before its tests start, and each suite reads it.
export function readGuestBundles(): Promise<string> {
  return readTestTemplate({
    name: 'nixie-conversation-guest',
    root: repoRoot,
    inputs: ['guests/conversation/src/**/*', 'libs/wire/src/**/*', '*/*/package.json', 'bun.lock'],
    write: (building) =>
      writeGuestBundles({ outDir: building, cliPath: resolveInstalledCLIPath() }),
  });
}

if (import.meta.main) {
  await readGuestBundles();
}
