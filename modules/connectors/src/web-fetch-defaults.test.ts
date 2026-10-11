import { expect, test } from 'bun:test';
import { webFetchDefaults } from './web-fetch-defaults';

// impd gives every built image a 4096 MiB filesystem and starts no sandbox on a smaller disk
test("it gives the fetch sandbox a disk no smaller than a built imp image's filesystem", () => {
  expect(webFetchDefaults.sandboxLimits.diskMiB).toBeGreaterThanOrEqual(4096);
});
