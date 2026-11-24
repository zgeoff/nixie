import type { Sandbox, SandboxAdapter } from '../types';
import type { UnheldSecretsOptions } from './remove-unheld-secrets';
import { removeUnheldSecrets } from './remove-unheld-secrets';

export type SecretCleanupOptions = Omit<UnheldSecretsOptions, 'adapter' | 'readPendingNames'>;

// Removes the broker secrets that no live sandbox holds after each sandbox destroy. A secret a
// grant added stays until a sandbox created with it exists, so a cleanup that runs between the two
// never removes it. The restart sweep runs the same cleanup at start, when no grant is in flight.
export function withSecretCleanup(
  adapter: SandboxAdapter,
  options: SecretCleanupOptions,
): SandboxAdapter {
  const pending = new Set<string>();

  const clean = (): Promise<readonly string[]> =>
    removeUnheldSecrets({ ...options, adapter, readPendingNames: () => [...pending] });

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

      await clean().catch((error: unknown) => {
        options.logger(
          'sandbox.secret_cleanup_failed',
          { reason: error instanceof Error ? error.message : String(error) },
          'warn',
        );
      });
    },
  });

  return {
    id: adapter.id,
    create: async (spec) => {
      const sandbox = await adapter.create(spec);

      for (const grant of spec.grants) {
        pending.delete(grant.secret);
      }

      return wrap(sandbox);
    },
    read: async (id) => {
      const sandbox = await adapter.read(id);

      return sandbox === null ? null : wrap(sandbox);
    },
    list: async (owner) => {
      const sandboxes = await adapter.list(owner);

      return sandboxes.map((sandbox) => wrap(sandbox));
    },
    addSecret: async (secret) => {
      pending.add(secret.name);

      await adapter.addSecret(secret);
    },
    removeSecret: adapter.removeSecret,
    addImage: adapter.addImage,
    checkRuntime: adapter.checkRuntime,
  };
}
