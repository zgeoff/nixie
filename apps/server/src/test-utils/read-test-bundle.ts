import { join } from 'node:path';
import { readTestTemplate } from '@heynixie/testing';
import { z } from 'zod';
import type { ReleaseBundle } from '../release/write-release-bundle';
import { writeReleaseBundle } from '../release/write-release-bundle';

export interface TestBundle extends ReleaseBundle {
  readonly entry: string;
  readonly mainText: string;
}

const bundles = new Map<boolean, Promise<TestBundle>>();

// The test script writes both bundles before the unit run, because a build runs past the unit limit.
// Finding one hashes every source file, 1.7 s on a loaded host, so a process finds each bundle once.
export async function readTestBundle(isTestBuild: boolean): Promise<TestBundle> {
  const known = bundles.get(isTestBuild);

  if (known !== undefined) {
    return known;
  }

  const reading = loadTestBundle(isTestBuild);

  bundles.set(isTestBuild, reading);

  try {
    return await reading;
  } catch (error) {
    bundles.delete(isTestBuild);
    throw error;
  }
}

const bundleSchema = z.object({
  files: z.array(z.string()),
  testBuildIDs: z.array(z.string()),
});

async function loadTestBundle(isTestBuild: boolean): Promise<TestBundle> {
  const directory = await writeBundleTemplate(isTestBuild);

  const entry = join(directory, 'out', 'main.js');

  const [bundle, mainText] = await Promise.all([
    Bun.file(join(directory, 'bundle.json'))
      .json()
      .then((value: unknown) => bundleSchema.parse(value)),
    Bun.file(entry).text(),
  ]);

  return { ...bundle, entry, mainText };
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

function writeBundleTemplate(isTestBuild: boolean): Promise<string> {
  const name = isTestBuild ? 'nixie-test-bundle' : 'nixie-release-bundle';

  return readTestTemplate({
    name,
    root: repoRoot,
    inputs: ['{apps,modules,libs,adapters,guests}/*/src/**/*', '*/*/package.json', 'bun.lock'],
    write: async (building) => {
      const bundle = await writeReleaseBundle(join(building, 'out'), isTestBuild);

      await Bun.write(join(building, 'bundle.json'), JSON.stringify(bundle));
    },
  });
}
