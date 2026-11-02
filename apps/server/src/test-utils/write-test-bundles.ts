import { join } from 'node:path';
import { collectSourceDirFaults } from './collect-source-dir-faults';
import { readTestBundle } from './read-test-bundle';

// One bundle at a time, because a host with little memory runs the script too.
export async function writeTestBundles(): Promise<void> {
  await readTestBundle(false);
  await readTestBundle(true);
}

if (import.meta.main) {
  await writeTestBundles();

  const [release, testBuild] = await Promise.all([readTestBundle(false), readTestBundle(true)]);

  const faults = collectSourceDirFaults(
    { test: testBuild.mainText, release: release.mainText },
    join(import.meta.dir, '..', '..', '..', '..', 'modules', 'sessions', 'src'),
  );

  if (faults.length > 0) {
    console.error(faults.join('\n'));
    process.exit(1);
  }
}
