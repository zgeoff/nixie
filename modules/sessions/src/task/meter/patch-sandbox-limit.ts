import type { SandboxLimit, SpendGateway } from '@heynixie/spend';

const attempts = 3;

// Sets a sandbox's limit whole. A call that the gateway did not answer goes again, and the result
// says whether the gateway took the limit. A name the gateway lacks never takes one.
export async function patchSandboxLimit(
  gateway: SpendGateway,
  sandboxID: string,
  limit: SandboxLimit | null,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const patched = await gateway.patchSandbox(sandboxID, limit);

    if (patched.kind === 'ok') {
      return true;
    }

    if (patched.kind === 'not_found') {
      return false;
    }
  }

  return false;
}
