import { join } from 'node:path';
import type { StartWriterOptions, Writer } from '@heynixie/log';
import type { RunTemplateOptions } from '@heynixie/testing';

export interface MigratedDataIO {
  readonly createTemplate: (options: RunTemplateOptions) => Promise<string>;

  readonly startWriter: (options: StartWriterOptions) => Promise<Pick<Writer, 'stop'>>;

  readonly copyDirectory: (from: string, to: string) => Promise<void>;
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// Migrating an empty data directory costs an in-process start about 100 ms of CPU, measured on
// 2 vCPUs, so one writer per run migrates a template that each start copies.
export async function writeMigratedData(dataDir: string, io: MigratedDataIO): Promise<void> {
  const t0 = performance.now();
  let built = -1;

  const template = await io.createTemplate({
    name: 'nixie-migrated-data',
    root: repoRoot,

    // a checkout with other database sources would replace a template in a shared folder while a
    // start in this checkout copies it
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-run-templates'),
    inputs: ['libs/db/src/**/*', 'modules/log/src/**/*', 'bun.lock'],
    write: async (building) => {
      const b0 = performance.now();

      const writer = await io.startWriter({ dataDir: building });

      const b1 = performance.now();

      await writer.stop();

      built = performance.now() - b0;

      console.error(
        `TIMING pid=${process.pid} build start=${Math.round(b1 - b0)} stop=${Math.round(performance.now() - b1)}`,
      );
    },
  });

  const t1 = performance.now();

  await io.copyDirectory(template, dataDir);

  console.error(
    `TIMING pid=${process.pid} template=${Math.round(t1 - t0)} built=${Math.round(built)} copy=${Math.round(performance.now() - t1)}`,
  );
}
