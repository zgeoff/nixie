import { readTestBundle } from './read-test-bundle';

// One bundle at a time, because a host with little memory runs the script too.
export async function writeTestBundles(): Promise<void> {
  await readTestBundle(false);
  await readTestBundle(true);
}

if (import.meta.main) {
  await writeTestBundles();
}
