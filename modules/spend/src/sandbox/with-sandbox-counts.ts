import type { Logger } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { sandboxKinds, workerRunOwnerPrefix } from '@heynixie/sandbox';
import type { Done, NotFound, RevisionChanged, SpendGateway, Unreachable } from '../types';
import { SandboxCountsUnreachableError } from './sandbox-counts-unreachable-error';

export interface SandboxCountsOptions {
  readonly gateway: SpendGateway;
  readonly log: Logger;
}

// A worker run's sandbox is left to the run, which registers it. A new sandbox registers with a PUT
// that starts its count at zero. A kept one registers once per process, keeping its count.
export function withSandboxCounts(
  adapter: SandboxAdapter,
  options: SandboxCountsOptions,
): SandboxAdapter {
  const registered = new Set<string>();

  const register = async (sandbox: Sandbox, isNew: boolean): Promise<void> => {
    if (!isCounted(sandbox.spec) || registered.has(sandbox.id)) {
      return;
    }

    const answer = isNew
      ? await options.gateway.putSandbox(sandbox.id, null)
      : await registerKept(options.gateway, sandbox.id);

    if (answer.kind === 'unreachable') {
      throw new SandboxCountsUnreachableError(sandbox.id, answer.reason);
    }

    if (answer.kind !== 'ok') {
      throw new Error(`the gateway did not register the sandbox ${sandbox.id}: ${answer.kind}`);
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

    // a sandbox whose destroy failed may still run, so it keeps its count until a destroy ends
    destroy: async () => {
      await sandbox.destroy();

      registered.delete(sandbox.id);

      await removeCount(options, sandbox);
    },
  });

  return {
    id: adapter.id,
    create: async (spec) => {
      const sandbox = await adapter.create(spec);

      try {
        await register(sandbox, true);
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

      await register(sandbox, false);

      return wrap(sandbox);
    },
    list: async (owner) => {
      const sandboxes = await adapter.list(owner);

      await Promise.all(sandboxes.map((sandbox) => register(sandbox, false)));

      return sandboxes.map((sandbox) => wrap(sandbox));
    },
    addSecret: adapter.addSecret,
    removeSecret: adapter.removeSecret,
    addImage: adapter.addImage,
    checkRuntime: adapter.checkRuntime,
  };
}

function isCounted(spec: SandboxSpec): boolean {
  return sandboxKinds[spec.kind].hasModelGrant && !spec.owner.startsWith(workerRunOwnerPrefix);
}

async function registerKept(
  gateway: SpendGateway,
  name: string,
): Promise<Done | NotFound | RevisionChanged | Unreachable> {
  const read = await gateway.readSandbox(name);

  if (read.kind === 'not_found') {
    return gateway.putSandbox(name, null);
  }

  if (read.kind === 'unreachable') {
    return read;
  }

  return gateway.patchSandbox(name, null);
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
