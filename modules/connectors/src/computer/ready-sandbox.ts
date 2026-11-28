import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, sandboxSizes } from '@heynixie/sandbox';
import { computerOwner } from './computer-owner';
import { computerFolders, copyComputerFolder } from './copy-computer-folder';
import { wakeOld } from './move-old-sandboxes';
import { probeCopyIncomplete } from './probe-copy-incomplete';
import type { ComputerContext, DesktopState } from './types';
import { writeCopyState } from './write-copy-state';
import { writeDiskUsedMarker } from './write-disk-used-marker';

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
  const others = existing.filter((sandbox) => sandbox.id !== kept?.id);

  // A sandbox of today's spec that stands beside older ones is a replacement whose move never
  // finished, so its disk is not trusted until a copy passes its check.
  if (kept !== undefined && others.length === 0) {
    state.sandbox = kept;
    state.isAsleep = false;

    return kept;
  }

  const created = kept === undefined ? await context.options.adapter.create(spec) : kept;

  const isReplaced = await replaceOld(context, others, {
    sandbox: created,
    isNew: kept === undefined,
  });

  if (!isReplaced) {
    if (kept === undefined) {
      await removeCreated(context, created);
    }

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

interface ReplacementTarget {
  readonly sandbox: Sandbox;

  // true for a sandbox this call created, whose disk holds nothing yet
  readonly isNew: boolean;
}

// An old sandbox whose last copy never finished is no source. A new disk counts as started from its
// first step, so a failure that leaves it behind never makes it a source.
async function replaceOld(
  context: ComputerContext,
  old: readonly Sandbox[],
  target: ReplacementTarget,
): Promise<boolean> {
  const homeEnv = context.options.homeEnv ?? {};
  const created = target.sandbox;
  const sources: Sandbox[] = [];
  const unverified: Sandbox[] = [];

  try {
    if (target.isNew) {
      await writeCopyState(created, homeEnv, 'started');
    }

    for (const sandbox of old) {
      await wakeOld(sandbox);

      const isIncomplete = await probeCopyIncomplete(sandbox, homeEnv);

      (isIncomplete ? unverified : sources).push(sandbox);
    }

    if (sources.length > 0) {
      await writeCopyState(created, homeEnv, 'started');

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

      await writeDiskUsedMarker(created, homeEnv);
    }

    if (target.isNew || sources.length > 0) {
      await writeCopyState(created, homeEnv, 'finished');
    }
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
