import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, sandboxSizes } from '@heynixie/sandbox';
import { computerOwner } from './computer-owner';
import { computerFolders, copyComputerFolder } from './copy-computer-folder';
import { wakeOld } from './move-old-sandboxes';
import type { ComputerContext, DesktopState } from './types';

// The computer's sandbox: the kept one that holds today's spec, or a new one that replaces older
// ones once every copy passed its check. It is null after a failed copy, with the old ones kept.
export async function readySandbox(context: ComputerContext): Promise<Sandbox | null> {
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
  const isReplaced = await replaceOld(context, existing, created);

  if (!isReplaced) {
    await discardCreated(context, created);

    return null;
  }

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

// Copies each old sandbox's folders into the new one and destroys the old ones only when every
// copy passed its check. It returns false, with nothing destroyed, when a copy failed.
async function replaceOld(
  context: ComputerContext,
  old: readonly Sandbox[],
  created: Sandbox,
): Promise<boolean> {
  const homeEnv = context.options.homeEnv ?? {};

  try {
    for (const sandbox of old) {
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
    }
  } catch (error) {
    context.options.logger('computer.copy_failed', { reason: String(error) }, 'warn');

    return false;
  }

  for (const sandbox of old) {
    await sandbox.destroy();
  }

  return true;
}

// The half-copied sandbox goes, so the next call does not take its partial disk for a kept one.
async function discardCreated(context: ComputerContext, created: Sandbox): Promise<void> {
  try {
    await created.destroy();
  } catch (error) {
    context.options.logger('computer.copy_failed', { reason: String(error) }, 'warn');
  }
}
