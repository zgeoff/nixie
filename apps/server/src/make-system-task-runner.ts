import type { ModelRole, ModelSecrets, ModelsConfig, ResolvedProfile } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { GuestCommand, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';
import { buildGuestCommand } from './build-guest-command';
import type { GuestEntry } from './types';

// What every system task with its own session starts from.
export interface SystemTaskOptions {
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly sandboxes: SandboxAdapter;

  // the conversation image's name in impd, from the sandbox manifest
  readonly image: string;
}

// What a system task's start gets: its role's profile with its credential, and its sandbox's
// limits and guest command.
export interface SystemTaskSession {
  readonly profile: ResolvedProfile;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;

  // registers a part's stop, which runs, the last registered first, when the runner stops or its
  // start fails
  readonly defer: (stop: () => Promise<void>) => void;
}

export interface SystemTaskSpec<Options extends SystemTaskOptions, Task> {
  // the model role whose profile the task's sessions run on
  readonly role: ModelRole;
  readonly entry: GuestEntry;
  readonly start: (options: Options, session: SystemTaskSession) => Promise<Task>;
}

export type SystemTaskRunner<Task> = Task & { readonly stop: () => Promise<void> };

// Makes the start of a system task that runs its own session, in its own long-lived sandbox on
// the conversation image, never the conversation's. A start that fails stops every part it
// started, so a retried start never leaves a run socket open.
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

  // the credentials resolve for every profile, or resolveModelCredentials throws first
  invariant(resolved, `the ${role} profile ${profile.id} has no credential`);

  return resolved;
}
