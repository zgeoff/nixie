import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';
import { waitOrTimeOut } from '../utils/wait-or-time-out';

export interface CodeSandboxDestroyDeps {
  readonly adapter: Pick<SandboxAdapter, 'read'>;
  readonly clock: Clock;
  readonly logger: Logger;
}

// Destroys the sandbox and then frees the call's slot. The sandbox holds unencrypted copies of the
// inputs and outputs, so a failed destroy comes back every 60 s until it succeeds, and the slot
// stays taken until then. Never throws, and returns after the first attempt.
export async function destroyCodeSandbox(
  deps: CodeSandboxDestroyDeps,
  sandbox: Sandbox,
  release: () => void,
): Promise<void> {
  const isDestroyed = await tryDestroy(deps, sandbox);

  if (isDestroyed) {
    release();

    return;
  }

  void retryDestroy(deps, sandbox, release);
}

// a destroy attempt that runs this long counts as failed, and a failed one comes back this often
const destroyRetryMs = 60_000;

async function tryDestroy(deps: CodeSandboxDestroyDeps, sandbox: Sandbox): Promise<boolean> {
  try {
    await waitOrTimeOut(sandbox.destroy(), {
      clock: deps.clock,
      deadline: deps.clock.now() + destroyRetryMs,
      message: 'the code sandbox destroy passed its time limit',
    });

    return true;
  } catch (error) {
    deps.logger(
      'code_run.destroy_failed',
      { sandbox: sandbox.id, ...toErrorFields(error) },
      'warn',
    );

    return false;
  }
}

async function retryDestroy(
  deps: CodeSandboxDestroyDeps,
  sandbox: Sandbox,
  release: () => void,
): Promise<void> {
  let isDone = false;

  while (!isDone) {
    await deps.clock.sleep(destroyRetryMs);

    isDone = await settleDestroy(deps, sandbox);
  }

  release();
}

// a sandbox that is already gone counts as destroyed
async function settleDestroy(deps: CodeSandboxDestroyDeps, sandbox: Sandbox): Promise<boolean> {
  const present = await deps.adapter.read(sandbox.id).catch(() => sandbox);

  if (present === null) {
    return true;
  }

  return tryDestroy(deps, sandbox);
}
