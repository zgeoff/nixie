import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';

export interface TestSandboxes {
  readonly sandboxes: SandboxAdapter;

  readonly retireSandboxes: (owner: string) => Promise<readonly string[]>;
}

export function buildRetirableSandboxes(adapter: SandboxAdapter): TestSandboxes {
  const retired = new Set<string>();

  const toListed = (sandbox: Sandbox): Sandbox =>
    retired.has(sandbox.id) ? { ...sandbox, isRetired: true } : sandbox;

  return {
    sandboxes: {
      ...adapter,
      read: async (id) => {
        const sandbox = await adapter.read(id);

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
