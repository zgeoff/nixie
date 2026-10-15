import type { Definitions, Log } from '@heynixie/log';
import type { Sandbox, SandboxAdapter, ToolTargetResolver } from '@heynixie/sandbox';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import { buildSandboxAdapter } from '../build-sandbox-adapter';

export interface TestSandboxesOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly toolTarget: ToolTargetResolver;

  // the folder that holds each sandbox of the process double
  readonly rootDir: string;
}

export interface TestSandboxes {
  readonly sandboxes: SandboxAdapter;

  // marks every sandbox the owner holds retired on each later get and list, as the imp adapter
  // marks an imp that impd still backs up, and returns their IDs
  readonly retireSandboxes: (owner: string) => Promise<readonly string[]>;
}

// The test build's process double, wrapped so a test can retire an owner's sandboxes, which the
// owner then replaces. Everything else reaches the double unchanged.
export function buildTestSandboxes(options: TestSandboxesOptions): TestSandboxes {
  const adapter = buildSandboxAdapter({
    recorder: buildSandboxRecorder({ log: options.log, definitions: options.definitions }),
    toolTarget: options.toolTarget,
    imp: { url: 'http://127.0.0.1:7070', publicEgress: null, token: 'impd-token' },
    testRootDir: options.rootDir,
  });

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
