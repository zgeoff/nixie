import type { SandboxLimit, SpendGateway } from '@heynixie/spend';
import { withSandboxLimitLock, writeSandboxLimit } from '@heynixie/spend';

const attempts = 3;

// Sets a sandbox's limit whole, behind any limit write of the sandbox that is in flight, on the
// revision it read, so an earlier call that lands late changes nothing. A call that the gateway did
// not take goes again, and the result says whether it took the limit. A name it lacks takes none.
export async function patchSandboxLimit(
  gateway: SpendGateway,
  sandboxID: string,
  limit: SandboxLimit | null,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const patched = await withSandboxLimitLock(sandboxID, () =>
      writeSandboxLimit(gateway, sandboxID, limit),
    );

    if (patched.kind === 'ok') {
      return true;
    }

    if (patched.kind === 'not_found') {
      return false;
    }
  }

  return false;
}
