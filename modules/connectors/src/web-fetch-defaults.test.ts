import { expect, test } from 'bun:test';
import { toolOutputLimitTokens } from '@heynixie/wire';
import { webFetchDefaults } from './web-fetch-defaults';

// impd gives every built image a 4096 MiB filesystem and starts no sandbox on a smaller disk
test("it gives the fetch sandbox a disk no smaller than a built imp image's filesystem", () => {
  expect(webFetchDefaults.sandboxLimits.diskMiB).toBeGreaterThanOrEqual(4096);
});

// link targets and text outside English run under 3 bytes a token, so the check allows 2
test('it keeps the returned text under the tool-output limit at 2 bytes a token', () => {
  expect(webFetchDefaults.limits.textBytes / 2).toBeLessThan(toolOutputLimitTokens);
});
