import { join } from 'node:path';
import { createRunTemplate } from '@heynixie/testing';
import { resolveInstalledCLIPath } from '../resolve-installed-cli-path';
import { writeGuestBundles } from '../write-guest-bundles';

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// The suites run the guest as the image does, from its bundles, so the Agent SDK lane fills the
// template before its tests start, and each suite reads it.
export function readGuestBundles(): Promise<string> {
  return createRunTemplate({
    name: 'nixie-conversation-guest',
    root: repoRoot,
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-test-bundles'),
    inputs: ['guests/conversation/src/**/*', 'libs/wire/src/**/*', '*/*/package.json', 'bun.lock'],
    write: (building) =>
      writeGuestBundles({ outDir: building, cliPath: resolveInstalledCLIPath() }),
  });
}

if (import.meta.main) {
  await readGuestBundles();
}
