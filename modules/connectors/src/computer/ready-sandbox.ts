import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, sandboxSizes } from '@heynixie/sandbox';
import { computerOwner } from './computer-owner';
import { computerFolders, copyComputerFolder } from './copy-computer-folder';
import { wakeOld } from './move-old-sandboxes';
import { probeCopyIncomplete } from './probe-copy-incomplete';
import type { ComputerContext, DesktopState } from './types';
import { writeCopyState } from './write-copy-state';
import { writeDiskUsedMarker } from './write-disk-used-marker';

// The computer's sandbox: a lone one of today's spec whose copy finished, or a new one that replaces
// every other once each copy passed its check. It is null after a failed copy, with the old ones kept.
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

  const found = findKeptSandbox(existing, spec);
  const lone = existing.length === 1 ? found : undefined;

  if (lone !== undefined) {
    const isDone = await probeCopyDone(context, lone);

    if (isDone) {
      state.sandbox = lone;
      state.isAsleep = false;

      return lone;
    }
  }

  const created = await context.options.adapter.create(spec);
  const isReplaced = await replaceOld(context, existing, created);

  if (!isReplaced) {
    await removeCreated(context, created);

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

async function probeCopyDone(context: ComputerContext, sandbox: Sandbox): Promise<boolean> {
  await wakeOld(sandbox);

  return !(await probeCopyIncomplete(sandbox, context.options.homeEnv ?? {}));
}

// The new disk counts as started from its first step, so a failure that leaves it behind never
// makes it a source.
async function replaceOld(
  context: ComputerContext,
  old: readonly Sandbox[],
  created: Sandbox,
): Promise<boolean> {
  const homeEnv = context.options.homeEnv ?? {};
  const sources: Sandbox[] = [];
  const unverified: Sandbox[] = [];

  try {
    await writeCopyState(created, homeEnv, 'started');

    for (const sandbox of old) {
      await wakeOld(sandbox);

      const isIncomplete = await probeCopyIncomplete(sandbox, homeEnv);

      (isIncomplete ? unverified : sources).push(sandbox);
    }

    for (const sandbox of sources) {
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

    if (sources.length > 0) {
      await writeDiskUsedMarker(created, homeEnv);
    }

    await writeCopyState(created, homeEnv, 'finished');
  } catch (error) {
    context.options.logger('computer.copy_failed', { reason: String(error) }, 'warn');

    return false;
  }

  for (const sandbox of [...sources, ...unverified]) {
    await sandbox.destroy();
  }

  return true;
}

// The half-copied sandbox goes, so the next call does not take its partial disk for a kept one.
async function removeCreated(context: ComputerContext, created: Sandbox): Promise<void> {
  try {
    await created.destroy();
  } catch (error) {
    context.options.logger('computer.copy_failed', { reason: String(error) }, 'warn');
  }
}
