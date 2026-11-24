import invariant from 'tiny-invariant';
import { withWriteTransaction } from '../record/with-write-transaction';
import type { Definitions, Log } from '../types';
import type { ErasableKind } from './erasable-kind';
import type { ErasureEffects } from './erasure-effects';
import type { OpenErasure } from './read-open-erasures';
import { readOpenErasures } from './read-open-erasures';
import { removeErasureKeys } from './remove-erasure-keys';
import type { ErasureEntry, ErasureTarget } from './types';
import { writeErasureFinished } from './write-erasure-finished';

export interface ErasureRunContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly effects: ErasureEffects;
  readonly entries: ReadonlyMap<ErasableKind, ErasureEntry>;
}

// Steps 2 to 9 for one erasure and its whole tree of children. Each step runs again after a crash
// with the same result, so a call after a failure picks up where the failure left off.
export async function runErasureTree(context: ErasureRunContext, root: OpenErasure): Promise<void> {
  const effects = context.effects;

  const open = await readOpenErasures(context.log);

  const tree = new Map(
    collectTree(open, root).map((erasure) => [erasure.started.erasureID, erasure]),
  );

  effects.holdCaptures(root.started.erasureID);

  await effects.closeCaptures();

  const removedKeys = new Map<string, number>();

  // children, then sandboxes, then keys, until a scan finds no child that is new
  for (;;) {
    await growTree(context, tree);

    const pending = [...tree.values()].filter(
      (erasure) => !removedKeys.has(erasure.started.erasureID),
    );

    if (pending.length === 0) {
      break;
    }

    await effects.destroySandboxes(
      pending.flatMap((erasure) => erasure.started.capture.sandboxCallIDs),
    );

    await reachFaultPoint(effects, 'erasure.sandboxes_destroyed', root);

    for (const erasure of pending) {
      const count = await removeErasureKeys(context.log, erasure.started.capture);

      removedKeys.set(erasure.started.erasureID, count);
    }

    await reachFaultPoint(effects, 'erasure.keys_removed', root);
  }

  for (const erasure of tree.values()) {
    await cleanErasure(context, erasure);
  }

  await reachFaultPoint(effects, 'erasure.cleaned', root);

  for (const erasure of tree.values()) {
    await removeTurnInputs(effects, erasure);
  }

  effects.releaseCaptures(root.started.erasureID);

  await reachFaultPoint(effects, 'erasure.turn_inputs_removed', root);

  for (const erasure of orderChildrenFirst(tree)) {
    await writeErasureFinished(context, erasure, removedKeys.get(erasure.started.erasureID) ?? 0);
  }
}

// The root and every open erasure under it: a crash in the middle of step 3 leaves children open.
function collectTree(open: readonly OpenErasure[], root: OpenErasure): readonly OpenErasure[] {
  const members = new Set([root.started.erasureID]);

  let isGrowing = true;

  while (isGrowing) {
    isGrowing = false;

    for (const erasure of open) {
      const parentID = erasure.started.parentID;

      if (parentID !== null && members.has(parentID) && !members.has(erasure.started.erasureID)) {
        members.add(erasure.started.erasureID);

        isGrowing = true;
      }
    }
  }

  return open.filter((erasure) => members.has(erasure.started.erasureID));
}

// Finds the children of every erasure in the tree until a pass finds no target that is new. A
// target that already has an open erasure joins the tree, so shared and cyclic children finish once.
async function growTree(context: ErasureRunContext, tree: Map<string, OpenErasure>): Promise<void> {
  let isNew = true;

  while (isNew) {
    isNew = false;

    const seen = new Set([...tree.values()].map((erasure) => buildTargetKey(toTarget(erasure))));

    for (const erasure of tree.values()) {
      const entry = getEntry(context, erasure.started.kind);

      const children = await withWriteTransaction(context.log.writer, (tx) =>
        entry.readChildren(tx, toTarget(erasure)),
      );

      for (const child of children) {
        if (seen.has(buildTargetKey(child))) {
          continue;
        }

        seen.add(buildTargetKey(child));

        const joined = await beginOrJoin(context, erasure, child);

        if (joined !== null) {
          tree.set(joined.started.erasureID, joined);

          isNew = true;
        }
      }
    }
  }
}

function buildTargetKey(target: Pick<ErasureTarget, 'kind' | 'targetID'>): string {
  return `${target.kind}:${target.targetID}`;
}

function toTarget(erasure: OpenErasure): ErasureTarget {
  return {
    kind: erasure.started.kind,
    targetID: erasure.started.targetID,
    version: erasure.started.version,
  };
}

function getEntry(context: ErasureRunContext, kind: ErasableKind): ErasureEntry {
  const entry = context.entries.get(kind);

  invariant(entry, `an erasable of kind ${kind} is registered`);

  return entry;
}

async function beginOrJoin(
  context: ErasureRunContext,
  parent: OpenErasure,
  child: ErasureTarget,
): Promise<OpenErasure | null> {
  const open = await readOpenErasures(context.log);

  const existing = open.find(
    (erasure) => buildTargetKey(toTarget(erasure)) === buildTargetKey(child),
  );

  if (existing !== undefined) {
    return existing;
  }

  const begun = await getEntry(context, child.kind).beginChild(child, {
    erasureID: parent.started.erasureID,
    by: parent.started.by,
  });

  if (begun.status === 'refused') {
    return null;
  }

  const reread = await readOpenErasures(context.log);

  const started = reread.find((erasure) => erasure.started.erasureID === begun.erasureID);

  invariant(started, 'the child erasure that just began is open');

  return started;
}

async function reachFaultPoint(
  effects: ErasureEffects,
  point: Parameters<ErasureEffects['reachFaultPoint']>[0],
  root: OpenErasure,
): Promise<void> {
  if (NIXIE_TEST_BUILD) {
    await effects.reachFaultPoint(point, root.started.erasureID);
  }
}

async function cleanErasure(context: ErasureRunContext, erasure: OpenErasure): Promise<void> {
  const capture = erasure.started.capture;

  await getEntry(context, erasure.started.kind).cleanIndexes(toTarget(erasure));

  await context.effects.cleanupSessions(capture.sessionCause);

  for (const purge of capture.purges) {
    await context.effects.finishPurges(purge.recordSequence);
  }
}

async function removeTurnInputs(effects: ErasureEffects, erasure: OpenErasure): Promise<void> {
  const capture = erasure.started.capture;
  const turnInputs = capture.turnInputs;

  if (turnInputs.threads === 'all') {
    await effects.removeTurnInputs({ threads: [], fromSequence: null });

    return;
  }

  const cleaned = turnInputs.cleaned ? await effects.readCleanedThreads(capture.sessionCause) : [];

  await effects.removeTurnInputs({
    threads: [...turnInputs.threads, ...cleaned],
    fromSequence: turnInputs.floor,
  });
}

function orderChildrenFirst(tree: ReadonlyMap<string, OpenErasure>): readonly OpenErasure[] {
  const depthOf = (erasure: OpenErasure): number => {
    const parent =
      erasure.started.parentID === null ? undefined : tree.get(erasure.started.parentID);

    return parent === undefined ? 0 : 1 + depthOf(parent);
  };

  return [...tree.values()].toSorted((left, right) => depthOf(right) - depthOf(left));
}
