import type {
  HarnessEntry,
  ModelRole,
  ModelSecrets,
  ModelsConfig,
  ResolvedProfile,
} from '@heynixie/models';
import { bindHarness, resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type {
  GuestCommand,
  SandboxAdapter,
  SandboxImageKey,
  SandboxLimits,
} from '@heynixie/sandbox';
import invariant from 'tiny-invariant';
import { buildGuestCommand } from './build-guest-command';
import { getHarnessImage } from './get-harness-image';
import type { StepCapturePort } from './open-step-capture';

export interface SystemTaskOptions {
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly sandboxes: SandboxAdapter;

  // each harness's image, under the key its record names
  readonly images: Readonly<Partial<Record<SandboxImageKey, string>>>;

  // the turn-input log, for the steps of this runner
  readonly turnInputs?: StepCapturePort;
}

export interface SystemTaskSession {
  readonly role: ModelRole;
  readonly profile: ResolvedProfile;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;

  readonly defer: (stop: () => Promise<void>) => void;
}

export interface SystemTaskSpec<Options extends SystemTaskOptions, Task> {
  readonly role: ModelRole;
  readonly entry: HarnessEntry;
  readonly start: (options: Options, session: SystemTaskSession) => Promise<Task>;
}

export type SystemTaskRunner<Task> = Task & { readonly stop: () => Promise<void> };

export function makeSystemTaskRunner<Options extends SystemTaskOptions, Task extends object>(
  spec: SystemTaskSpec<Options, Task>,
): (options: Options) => Promise<SystemTaskRunner<Task>> {
  return async (options) => {
    const started = new AsyncDisposableStack();

    try {
      const profile = resolveRoleCredential(options, spec.role);
      const harness = bindHarness(profile.profile);

      const task = await spec.start(options, {
        role: spec.role,
        profile,
        image: getHarnessImage(options.images, harness.imageKey),
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
        command: buildGuestCommand(options.sandboxes, harness.guest, spec.entry),
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

  invariant(resolved, `the ${role} profile ${profile.id} was never resolved`);

  return resolved;
}
