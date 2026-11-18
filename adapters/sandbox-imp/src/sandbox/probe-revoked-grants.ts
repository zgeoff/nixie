import type { SandboxSpec } from '@heynixie/sandbox';
import type { ImpPort } from '../types';

// Whether an imp that already exists lost a grant of its spec, as a rotate with a rebind does. A
// start replaces such an imp, because its broker requirement fails.
export async function probeRevokedGrants(
  port: ImpPort,
  sandboxID: string,
  spec: Pick<SandboxSpec, 'grants'>,
): Promise<boolean> {
  const held = await port.readGrants(sandboxID);

  return spec.grants.some((grant) => !held.some((row) => row.secret === grant.secret));
}
