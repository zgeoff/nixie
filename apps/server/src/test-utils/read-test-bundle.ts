import { join } from 'node:path';
import { createRunTemplate } from '@heynixie/testing';
import { z } from 'zod';
import type { ReleaseBundle } from '../write-release-bundle';
import { writeReleaseBundle } from '../write-release-bundle';

export interface TestBundle extends ReleaseBundle {
  readonly mainText: string;
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

const bundleSchema = z.object({
  files: z.array(z.string()),
  testBuildIDs: z.array(z.string()),
});

// A bundle of the whole server takes seconds, and a test that built one ran past the unit limit
// beside the other workers, so the test script writes both bundles before the unit run starts.
export async function readTestBundle(isTestBuild: boolean): Promise<TestBundle> {
  const directory = await createRunTemplate({
    name: isTestBuild ? 'nixie-test-bundle' : 'nixie-release-bundle',
    root: repoRoot,
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-test-bundles'),
    inputs: ['{apps,modules,libs,adapters,guests}/*/src/**/*', '*/*/package.json', 'bun.lock'],
    write: async (building) => {
      const bundle = await writeReleaseBundle(join(building, 'out'), isTestBuild);

      await Bun.write(join(building, 'bundle.json'), JSON.stringify(bundle));
    },
  });

  const [bundle, mainText] = await Promise.all([
    Bun.file(join(directory, 'bundle.json'))
      .json()
      .then((value: unknown) => bundleSchema.parse(value)),
    Bun.file(join(directory, 'out', 'main.js')).text(),
  ]);

  return { ...bundle, mainText };
}
