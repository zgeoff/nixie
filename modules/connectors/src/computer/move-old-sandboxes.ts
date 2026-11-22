import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import type { Sandbox } from '@heynixie/sandbox';
import { legacyComputerOwners } from './computer-owner';
import type { ComputerFolder } from './copy-computer-folder';
import { copyComputerFolder } from './copy-computer-folder';
import type { ComputerOptions } from './start-computer';

interface MoveContext {
  readonly options: ComputerOptions;
  readonly clock: Clock;
  readonly state: { isMoved: boolean };
}

const diskUsedMarker = '.nixie-disk-used';

// Copies the profile and the files of the earlier release's browser and shell sandboxes into the
// computer's disk and destroys both, only when every copy passed its check. It runs before the
// guest starts, so Chromium has written nothing to the new disk.
export async function moveOldSandboxes(context: MoveContext, sandbox: Sandbox): Promise<boolean> {
  if (context.state.isMoved) {
    return true;
  }

  const old = await readOldSandboxes(context);

  if (old.length === 0) {
    context.state.isMoved = true;

    return true;
  }

  const startedAtMs = context.clock.now();

  try {
    for (const entry of old) {
      await wakeOld(entry.sandbox);

      await copyComputerFolder({
        from: entry.sandbox,
        fromEnv: context.options.legacyHomeEnv ?? {},
        to: sandbox,
        toEnv: context.options.homeEnv ?? {},
        folder: entry.folder,
      });
    }

    const home = await sandbox.resolveHome(context.options.homeEnv ?? {});

    await sandbox.copyIn([
      { path: join(home.copyPath, diskUsedMarker), content: new Uint8Array() },
    ]);
  } catch (error) {
    context.options.logger(
      'computer.move_failed',
      { reason: error instanceof Error ? error.message : String(error) },
      'warn',
    );

    return false;
  }

  for (const entry of old) {
    try {
      await entry.sandbox.destroy();
    } catch (error) {
      context.options.logger('computer.move_failed', { reason: String(error) }, 'warn');

      return false;
    }
  }

  context.state.isMoved = true;

  context.options.logger('computer.moved', {
    sandboxes: old.length,
    durationMs: context.clock.now() - startedAtMs,
  });

  return true;
}

// the earlier sandboxes, each with the folder it kept: the browser's profile and the shell's files
const legacySources = [
  { owner: legacyComputerOwners.browser, folder: 'profile' },
  { owner: legacyComputerOwners.shell, folder: 'files' },
] as const satisfies readonly { readonly owner: string; readonly folder: ComputerFolder }[];

async function readOldSandboxes(
  context: MoveContext,
): Promise<readonly { readonly sandbox: Sandbox; readonly folder: ComputerFolder }[]> {
  const listed = await Promise.all(
    legacySources.map(async (source) => {
      const sandboxes = await context.options.adapter.list(source.owner);

      return sandboxes.map((sandbox) => ({ sandbox, folder: source.folder }));
    }),
  );

  return listed.flat();
}

export async function wakeOld(sandbox: Sandbox): Promise<void> {
  if (sandbox.suspension.kind === 'memory') {
    await sandbox.suspension.wake();
  }
}
