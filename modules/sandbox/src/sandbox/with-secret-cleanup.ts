import type { Sandbox, SandboxAdapter } from '../types';
import type { UnheldSecretsOptions } from './remove-unheld-secrets';
import { removeUnheldSecrets } from './remove-unheld-secrets';

export type SecretCleanupOptions = Omit<UnheldSecretsOptions, 'adapter'>;

// Removes the broker secrets that no live sandbox holds after each sandbox destroy, except a name
// this process added, which a runner may still grant from its cache. Adds and removals run one at a
// time, so a removal never lands between an add and the sandbox that needs the name.
export function withSecretCleanup(
  adapter: SandboxAdapter,
  options: SecretCleanupOptions,
): SandboxAdapter {
  const added = new Set<string>();

  const queue: { tail: Promise<void> } = { tail: Promise.resolve() };

  const runExclusive = async <Result>(task: () => Promise<Result>): Promise<Result> => {
    const previous = queue.tail;
    const turn = Promise.withResolvers<void>();

    queue.tail = turn.promise;

    await previous;

    try {
      return await task();
    } finally {
      turn.resolve();
    }
  };

  const removeSecret: SandboxAdapter['removeSecret'] = (name) =>
    runExclusive(async () => {
      if (!added.has(name)) {
        await adapter.removeSecret(name);
      }
    });

  const clean = (): Promise<readonly string[]> =>
    removeUnheldSecrets({ ...options, adapter: { id: adapter.id, removeSecret } });

  const cleanQuietly = async (): Promise<void> => {
    await clean().catch((error: unknown) => {
      options.logger(
        'sandbox.secret_cleanup_failed',
        { reason: error instanceof Error ? error.message : String(error) },
        'warn',
      );
    });
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
      await sandbox.destroy();

      await cleanQuietly();
    },
  });

  return {
    id: adapter.id,
    create: async (spec) => {
      try {
        const sandbox = await adapter.create(spec);

        return wrap(sandbox);
      } catch (error) {
        // No sandbox holds the names of a failed create, so they stop being protected and the
        // cleanup removes them. A caller that cached the grant adds it again on its next attempt.
        for (const grant of spec.grants) {
          added.delete(grant.secret);
        }

        await cleanQuietly();

        throw error;
      }
    },
    read: async (id) => {
      const sandbox = await adapter.read(id);

      return sandbox === null ? null : wrap(sandbox);
    },
    list: async (owner) => {
      const sandboxes = await adapter.list(owner);

      return sandboxes.map((sandbox) => wrap(sandbox));
    },
    addSecret: (secret) =>
      runExclusive(async () => {
        added.add(secret.name);

        await adapter.addSecret(secret);
      }),
    removeSecret,
    addImage: adapter.addImage,
    checkRuntime: adapter.checkRuntime,
  };
}
