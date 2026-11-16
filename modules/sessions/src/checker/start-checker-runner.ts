import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { bindHarness, deriveModelSecret } from '@heynixie/models';
import type { ResolvedProfile } from '@heynixie/models';
import type {
  GuestCommand,
  Sandbox,
  SandboxAdapter,
  SandboxLimits,
  SandboxSpec,
} from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, removeSandboxes } from '@heynixie/sandbox';
import { runSandboxCheck } from '../sandbox/run-sandbox-check';
import type { RunCheck } from './checker-request';
import { makeChecker } from './make-checker';

export interface CheckerRunnerOptions {
  readonly profile: ResolvedProfile;
  readonly sandboxes: SandboxAdapter;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;
  readonly timeoutMs?: number;

  readonly clock: Clock;

  readonly log: Logger;
}

export const checkerOwner = 'checker';

export async function startCheckerRunner(options: CheckerRunnerOptions): Promise<RunCheck> {
  const harness = bindHarness(options.profile.profile);
  const secret = deriveModelSecret(options.profile, harness);

  await options.sandboxes.addSecret(secret);

  const spec = buildSandboxSpec({
    kind: 'checker',
    image: options.image,
    owner: checkerOwner,
    limits: options.limits,
    modelGrant: harness.buildGrant(secret),
  });

  const sandbox = await createCheckerSandbox(options.sandboxes, spec, options.log);

  const profile = options.profile.profile;

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
          profile: harness.toTurnProfile('one-off'),
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
