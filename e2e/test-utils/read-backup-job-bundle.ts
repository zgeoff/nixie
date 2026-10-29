import { join } from 'node:path';
import { createRunTemplate } from '@heynixie/testing';

const repoRoot = join(import.meta.dir, '..', '..');

// The suites run the job as the image does, from its bundle, so the e2e and restic lanes fill the
// template before their tests start, and each suite reads it.
export async function readBackupJobBundle(): Promise<string> {
  const directory = await createRunTemplate({
    name: 'nixie-backup-job',
    root: repoRoot,
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-test-bundles'),
    inputs: ['apps/backup-job/src/**/*', 'libs/*/src/**/*', '*/*/package.json', 'bun.lock'],
    write: async (building) => {
      await Bun.build({
        entrypoints: [join(repoRoot, 'apps', 'backup-job', 'src', 'main.ts')],
        target: 'bun',
        define: { NIXIE_TEST_BUILD: 'false' },
        outdir: building,
        naming: 'main.js',
      });
    },
  });

  return join(directory, 'main.js');
}

if (import.meta.main) {
  await readBackupJobBundle();
}
