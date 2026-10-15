import type { Logger } from '@heynixie/ops';
import type { Sandbox, SandboxAdapter, SandboxLimits, SandboxSpec } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox } from '@heynixie/sandbox';
import { buildModelGrant } from './build-model-grant';
import { deriveModelSecret } from './derive-model-secret';
import { makeChecker } from './make-checker';
import type { GuestCommand } from './run-guest-turn';
import { runSandboxCheck } from './run-sandbox-check';
import type { ResolvedProfile, RunCheck } from './types';

export interface CheckerRunnerOptions {
  // the checker role's profile, read once at start
  readonly profile: ResolvedProfile;
  readonly sandboxes: SandboxAdapter;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;
  readonly timeoutMs?: number;

  // takes each check's timings
  readonly log: Logger;
}

// Starts the checker on its role's profile, in its own long-lived sandbox on the conversation
// image: one query with no tools per check. It keeps the sandbox when its spec still matches and
// replaces it otherwise, so the checker never shares a sandbox with the conversation.
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

// keeps the one sandbox whose spec matches and its adapter has not retired, destroys the rest, or creates one when none matches
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

// the owner of the checker's sandbox, which lives for the deployment, so recovery keeps it
export const checkerOwner = 'checker';
