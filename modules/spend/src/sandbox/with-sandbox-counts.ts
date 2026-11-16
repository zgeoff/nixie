import type { Logger } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { sandboxKinds, workerRunOwnerPrefix } from '@heynixie/sandbox';
import type { SpendGateway } from '../types';

export interface SandboxCountsOptions {
  readonly gateway: SpendGateway;
  readonly log: Logger;
}

// A worker run's sandbox is left to the run, which registers it with the worker's limits. A sandbox
// that an earlier process made registers once per process, so a kept one has its count.
export function withSandboxCounts(
  adapter: SandboxAdapter,
  options: SandboxCountsOptions,
): SandboxAdapter {
  const registered = new Set<string>();

  const register = async (sandbox: Sandbox): Promise<void> => {
    if (!isCounted(sandbox.spec) || registered.has(sandbox.id)) {
      return;
    }

    const put = await options.gateway.putSandbox(sandbox.id, null);

    if (put.kind !== 'ok') {
      throw new Error(`the gateway did not register the sandbox ${sandbox.id}: ${put.reason}`);
    }

    registered.add(sandbox.id);
  };

  const wrap = (sandbox: Sandbox): Sandbox => ({
    ...sandbox,
    get id() {
      return sandbox.id;
    },
    get spec() {
      return sandbox.spec;
    },
    get isRetired() {
      return sandbox.isRetired;
    },
    get suspension() {
      return sandbox.suspension;
    },
    destroy: async () => {
      try {
        await sandbox.destroy();
      } finally {
        registered.delete(sandbox.id);

        await removeCount(options, sandbox);
      }
    },
  });

  return {
    id: adapter.id,
    create: async (spec) => {
      const sandbox = await adapter.create(spec);

      try {
        await register(sandbox);
      } catch (error) {
        await sandbox.destroy().catch(() => {});

        throw error;
      }

      return wrap(sandbox);
    },
    read: async (id) => {
      const sandbox = await adapter.read(id);

      if (sandbox === null) {
        return null;
      }

      await register(sandbox);

      return wrap(sandbox);
    },
    list: async (owner) => {
      const sandboxes = await adapter.list(owner);

      await Promise.all(sandboxes.map((sandbox) => register(sandbox)));

      return sandboxes.map((sandbox) => wrap(sandbox));
    },
    addSecret: adapter.addSecret,
    addImage: adapter.addImage,
    checkRuntime: adapter.checkRuntime,
  };
}

function isCounted(spec: SandboxSpec): boolean {
  return sandboxKinds[spec.kind].hasModelGrant && !spec.owner.startsWith(workerRunOwnerPrefix);
}

async function removeCount(options: SandboxCountsOptions, sandbox: Sandbox): Promise<void> {
  if (!sandboxKinds[sandbox.spec.kind].hasModelGrant) {
    return;
  }

  const removed = await options.gateway.removeSandbox(sandbox.id);

  if (removed.kind !== 'ok') {
    options.log(
      'spend.sandbox_remove_failed',
      { sandboxID: sandbox.id, reason: removed.reason },
      'warn',
    );
  }
}
