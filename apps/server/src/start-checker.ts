import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import type { ModelSecrets, ModelsConfig } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { Logger } from '@heynixie/ops';
import type { GuestCommand, SandboxAdapter } from '@heynixie/sandbox';
import type { RunCheck } from '@heynixie/sessions';
import { startCheckerRunner } from '@heynixie/sessions';
import invariant from 'tiny-invariant';
import { isTestSandbox } from './is-test-sandbox';

export interface CheckerOptions {
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly sandboxes: SandboxAdapter;

  // the conversation image's name in impd, from the sandbox manifest
  readonly image: string;
  readonly timeoutMs: number;
  readonly clock: Clock;
  readonly log: Logger;
}

// Starts the checker on the checker role's profile, in its own sandbox on the conversation image.
export function startChecker(options: CheckerOptions): Promise<RunCheck> {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, 'checker');
  const resolved = credentials[profile.id];

  // the credentials resolve for every profile, or resolveModelCredentials throws first
  invariant(resolved, `the checker profile ${profile.id} has no credential`);

  return startCheckerRunner({
    profile: resolved,
    sandboxes: options.sandboxes,
    image: options.image,
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
    command: buildCheckCommand(options.sandboxes),
    timeoutMs: options.timeoutMs,
    clock: options.clock,
    log: options.log,
  });
}

// The check guest runs from the conversation image's /app as the user nixie, and the test sandbox
// runs its source from the workspace with nixie's own Bun.
function buildCheckCommand(adapter: Pick<SandboxAdapter, 'id'>): GuestCommand {
  if (isTestSandbox(adapter)) {
    return {
      argv: [process.execPath, join(import.meta.dir, '../../../guests/conversation/src/check.ts')],
      env: {},
    };
  }

  return { argv: ['bun', '/app/guests/conversation/src/check.ts'], env: { HOME: '/home/nixie' } };
}
