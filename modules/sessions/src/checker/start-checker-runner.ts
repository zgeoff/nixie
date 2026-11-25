import type { Clock } from '@heynixie/clock';
import type { CredentialStore } from '@heynixie/credentials';
import type { Logger } from '@heynixie/logger';
import { bindHarness, grantModelSecret } from '@heynixie/models';
import type { ResolvedProfile } from '@heynixie/models';
import type {
  GuestCommand,
  Sandbox,
  SandboxAdapter,
  SandboxLimits,
  SandboxSpec,
} from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, removeSandboxes } from '@heynixie/sandbox';
import type { SpendGateway } from '@heynixie/spend';
import invariant from 'tiny-invariant';
import { runSandboxCheck } from '../sandbox/run-sandbox-check';
import { buildRoutedModel } from '../utils/build-routed-model';
import type { RunCheck } from './checker-request';
import { makeChecker } from './make-checker';

export interface CheckerRunnerOptions {
  readonly profile: ResolvedProfile;
  readonly store: CredentialStore;
  readonly sandboxes: SandboxAdapter;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;
  readonly timeoutMs?: number;

  readonly clock: Clock;

  // set when every model request goes through the gateway, which counts it under its sandbox
  readonly gateway?: SpendGateway;

  readonly log: Logger;
}

export const checkerOwner = 'checker';

export async function startCheckerRunner(options: CheckerRunnerOptions): Promise<RunCheck> {
  const harness = bindHarness(options.profile.profile);

  const secret = await grantModelSecret(options.profile, harness, options);

  const spec = buildSandboxSpec({
    kind: 'checker',
    image: options.image,
    owner: checkerOwner,
    limits: options.limits,
    modelGrant: harness.buildGrant(secret),
  });

  const sandbox = await createCheckerSandbox(options.sandboxes, spec, options.log);

  const profile = options.profile.profile;

  const routed = buildRoutedModel({
    isRouted: options.gateway !== undefined,
    profile: options.profile,
    turnProfile: harness.toTurnProfile('one-off'),
    sandboxName: sandbox.id,
  });

  const turnProfile = routed.turnProfile;

  // the models config refuses the checker role on any harness but the Agent SDK, so no checker runs
  // on a plan profile
  invariant(turnProfile.harness === 'agent-sdk', `the ${harness.id} harness runs no check`);

  return makeChecker({
    model: profile.model,
    clock: options.clock,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ask: (request, signal) =>
      runSandboxCheck({
        sandbox,
        command: options.command,
        signal,
        log: options.log,
        request: {
          profile: turnProfile,
          systemPrompt: request.prompt,
          input: request.input,
        },
      }),
  });
}

async function createCheckerSandbox(
  sandboxes: SandboxAdapter,
  spec: SandboxSpec,
  log: Logger,
): Promise<Sandbox> {
  const existing = await sandboxes.list(checkerOwner);

  const kept = findKeptSandbox(existing, spec);

  await removeSandboxes(
    existing.filter((sandbox) => sandbox !== kept),
    log,
  );

  if (kept !== undefined) {
    return kept;
  }

  return sandboxes.create(spec);
}
