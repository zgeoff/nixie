import type { Sandbox, SandboxSpec } from './types';

export function findKeptSandbox(
  existing: readonly Sandbox[],
  spec: SandboxSpec,
): Sandbox | undefined {
  return existing.find((sandbox) => !sandbox.isRetired && Bun.deepEquals(sandbox.spec, spec));
}
