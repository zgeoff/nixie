import { readTestBundle } from '../test-utils/read-test-bundle';
import { isServerTestRun } from './is-server-test-run';

// Finding the test bundle hashes the workspace's sources, which takes seconds on a loaded host. A
// preload runs outside every test's limit, so the first test that starts nixie doesn't pay it.
if (isServerTestRun(process.argv)) {
  await readTestBundle(true);
}
