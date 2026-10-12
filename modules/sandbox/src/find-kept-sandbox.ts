import type { Sandbox, SandboxSpec } from './types';

// The sandbox an owner keeps across a restart: the one whose spec matches and that its adapter has
// not retired. The owner replaces every other one.
export function findKeptSandbox(
  existing: readonly Sandbox[],
  spec: SandboxSpec,
): Sandbox | undefined {
  return existing.find((sandbox) => !sandbox.isRetired && Bun.deepEquals(sandbox.spec, spec));
}
