import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { buildModelGrant, deriveModelSecret } from '@heynixie/models';
import type { ResolvedProfile } from '@heynixie/models';
import type {
  GuestCommand,
  Sandbox,
  SandboxAdapter,
  SandboxLimits,
  SandboxSpec,
} from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox } from '@heynixie/sandbox';
import type { RunCheck } from './checker-types';
import { makeChecker } from './make-checker';
import { runSandboxCheck } from './run-sandbox-check';

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
  const secret = deriveModelSecret(options.profile);

  await options.sandboxes.addSecret(secret);

  const spec = buildSandboxSpec({
    kind: 'checker',
    image: options.image,
    owner: checkerOwner,
    limits: options.limits,
    modelGrant: buildModelGrant(secret),
  });

  const sandbox = await createCheckerSandbox(options.sandboxes, spec);

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
          profile: {
            model: profile.model,
            baseURL: profile.baseURL,
            effort: profile.effort,
            authHeader: profile.authHeader,
          },
          systemPrompt: request.prompt,
          input: request.input,
        },
      }),
  });
}

async function createCheckerSandbox(
  sandboxes: SandboxAdapter,
  spec: SandboxSpec,
): Promise<Sandbox> {
  const existing = await sandboxes.list(checkerOwner);

  const kept = findKeptSandbox(existing, spec);

  await Promise.all(
    existing.filter((sandbox) => sandbox !== kept).map((sandbox) => sandbox.destroy()),
  );

  if (kept !== undefined) {
    return kept;
  }

  return sandboxes.create(spec);
}
