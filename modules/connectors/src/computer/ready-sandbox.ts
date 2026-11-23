import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, sandboxSizes } from '@heynixie/sandbox';
import { computerOwner } from './computer-owner';
import { computerFolders, copyComputerFolder } from './copy-computer-folder';
import { wakeOld } from './move-old-sandboxes';
import type { ComputerContext, DesktopState } from './types';

// The computer's sandbox: the kept one that holds today's spec, or a new one. A kept sandbox of an
// older spec gives its disk to the new one, which replaces it.
export async function readySandbox(context: ComputerContext): Promise<Sandbox> {
  const state = context.state;

  if (state.sandbox !== null && !state.sandbox.isRetired) {
    if (state.isAsleep) {
      await wakeSandbox(state, state.sandbox);
    }

    return state.sandbox;
  }

  const spec = buildComputerSpec(context);

  const existing = await context.options.adapter.list(computerOwner);

  const kept = findKeptSandbox(existing, spec);

  if (kept !== undefined) {
    state.sandbox = kept;
    state.isAsleep = false;

    return kept;
  }

  const created = await context.options.adapter.create(spec);

  await replaceOld(context, existing, created);

  state.sandbox = created;
  state.isAsleep = false;

  state.tabs.clear();

  return created;
}

async function wakeSandbox(state: DesktopState, sandbox: Sandbox): Promise<void> {
  if (sandbox.suspension.kind === 'memory') {
    await sandbox.suspension.wake();
  }

  state.isAsleep = false;
}

function buildComputerSpec(context: ComputerContext) {
  return buildSandboxSpec({
    kind: 'computer',
    image: context.options.image,
    owner: computerOwner,
    limits: sandboxSizes.computer,
  });
}

async function replaceOld(
  context: ComputerContext,
  old: readonly Sandbox[],
  created: Sandbox,
): Promise<void> {
  const homeEnv = context.options.homeEnv ?? {};

  for (const sandbox of old) {
    try {
      await wakeOld(sandbox);

      for (const folder of computerFolders) {
        await copyComputerFolder({
          from: sandbox,
          fromEnv: homeEnv,
          to: created,
          toEnv: homeEnv,
          folder,
        });
      }
    } catch (error) {
      context.options.logger('computer.copy_failed', { reason: String(error) }, 'warn');
    }

    await sandbox.destroy();
  }
}
