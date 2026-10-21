import type { ModelRole, ModelSecrets, ModelsConfig, ResolvedProfile } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { GuestCommand, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';
import { buildGuestCommand } from './build-guest-command';
import type { GuestEntry } from './types';

export interface SystemTaskOptions {
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly sandboxes: SandboxAdapter;

  readonly image: string;
}

export interface SystemTaskSession {
  readonly profile: ResolvedProfile;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;

  readonly defer: (stop: () => Promise<void>) => void;
}

export interface SystemTaskSpec<Options extends SystemTaskOptions, Task> {
  readonly role: ModelRole;
  readonly entry: GuestEntry;
  readonly start: (options: Options, session: SystemTaskSession) => Promise<Task>;
}

export type SystemTaskRunner<Task> = Task & { readonly stop: () => Promise<void> };

export function makeSystemTaskRunner<Options extends SystemTaskOptions, Task extends object>(
  spec: SystemTaskSpec<Options, Task>,
): (options: Options) => Promise<SystemTaskRunner<Task>> {
  return async (options) => {
    const started = new AsyncDisposableStack();

    try {
      const task = await spec.start(options, {
        profile: resolveRoleCredential(options, spec.role),
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
        command: buildGuestCommand(options.sandboxes, spec.entry),
        defer: (stop) => {
          started.defer(stop);
        },
      });

      const stack = started.move();

      return { ...task, stop: () => stack.disposeAsync() };
    } catch (error) {
      await started.disposeAsync();

      throw error;
    }
  };
}

function resolveRoleCredential(options: SystemTaskOptions, role: ModelRole): ResolvedProfile {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, role);
  const resolved = credentials[profile.id];

  invariant(resolved, `the ${role} profile ${profile.id} has no credential`);

  return resolved;
}
