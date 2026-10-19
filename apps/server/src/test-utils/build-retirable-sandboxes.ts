import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';

export interface TestSandboxes {
  readonly sandboxes: SandboxAdapter;

  // marks every sandbox the owner holds retired on each later get and list, as the imp adapter
  // marks an imp that impd still backs up, and returns their IDs
  readonly retireSandboxes: (owner: string) => Promise<readonly string[]>;
}

// Wraps an adapter so a test can retire an owner's sandboxes, which the owner then replaces.
// Everything else reaches the adapter unchanged.
export function buildRetirableSandboxes(adapter: SandboxAdapter): TestSandboxes {
  const retired = new Set<string>();

  const toListed = (sandbox: Sandbox): Sandbox =>
    retired.has(sandbox.id) ? { ...sandbox, isRetired: true } : sandbox;

  return {
    sandboxes: {
      ...adapter,
      get: async (id) => {
        const sandbox = await adapter.get(id);

        return sandbox === null ? null : toListed(sandbox);
      },
      list: async (owner) => {
        const sandboxes = await adapter.list(owner);

        return sandboxes.map((sandbox) => toListed(sandbox));
      },
    },
    retireSandboxes: async (owner) => {
      const sandboxes = await adapter.list(owner);

      const ids = sandboxes.map((sandbox) => sandbox.id);

      for (const id of ids) {
        retired.add(id);
      }

      return ids;
    },
  };
}
