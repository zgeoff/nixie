import type { SandboxLimit, SpendGateway } from '@heynixie/spend';
import { withSandboxLimitLock, writeSandboxLimit } from '@heynixie/spend';

const attempts = 3;

// Sets a sandbox's limit whole, on the revision it read, and holds the sandbox's lock across every
// attempt, so no newer limit lands between a call that timed out and its retry. A call that the
// gateway did not take goes again; the result says whether it took the limit.
export function patchSandboxLimit(
  gateway: SpendGateway,
  sandboxID: string,
  limit: SandboxLimit | null,
): Promise<boolean> {
  return withSandboxLimitLock(sandboxID, async () => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const patched = await writeSandboxLimit(gateway, sandboxID, limit);

      if (patched.kind === 'ok') {
        return true;
      }

      if (patched.kind === 'not_found') {
        return false;
      }
    }

    return false;
  });
}
