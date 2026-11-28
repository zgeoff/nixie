import invariant from 'tiny-invariant';
import { withWriteTransaction } from '../record/with-write-transaction';
import type { Definitions, Log } from '../types';
import { collectFinishOrder } from './collect-finish-order';
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

  if (NIXIE_TEST_BUILD) {
    await effects.reachFaultPoint('erasure.begun', root.started.erasureID);
  }

  await effects.closeCaptures();

  const reached = collectReached(tree);

  const removed = new Set<string>();
  const cleaned = new Set<string>();
  const lateKeyIDs = new Set<string>();

  // Keys, then cleanup, until a scan after the cleanup finds no child that is new and no late key
  // that is new: a call that ran while the cleanup did can leave a record that holds the target's
  // text.
  for (;;) {
    await removeTreeKeys(context, { root, tree, reached, removed, lateKeyIDs });

    for (const erasure of tree.values()) {
      if (!cleaned.has(erasure.started.erasureID)) {
        await cleanErasure(context, erasure);

        cleaned.add(erasure.started.erasureID);
      }
    }

    if (NIXIE_TEST_BUILD) {
      await effects.reachFaultPoint('erasure.cleaned', root.started.erasureID);
    }

    await growTree(context, tree, reached);

    const isLate = await removeLateKeys(context, tree, lateKeyIDs);

    if (!isLate && [...tree.values()].every((erasure) => removed.has(erasure.started.erasureID))) {
      break;
    }
  }

  for (const erasure of tree.values()) {
    await removeTurnInputs(effects, erasure);
  }

  effects.releaseCaptures(root.started.erasureID);

  if (NIXIE_TEST_BUILD) {
    await effects.reachFaultPoint('erasure.turn_inputs_removed', root.started.erasureID);
  }

  // The walk starts at the root, so when a child reaches its own parent, as an image and its record
  // do, the root still finishes last, whatever order the open erasures read in after a crash.
  const erasureIDs = [
    root.started.erasureID,
    ...[...tree.keys()].filter((id) => id !== root.started.erasureID),
  ];

  for (const erasureID of collectFinishOrder(erasureIDs, reached)) {
    const erasure = tree.get(erasureID);

    invariant(erasure, 'the finish order names only erasures of the tree');

    await writeErasureFinished(context, erasure, getEntry(context, erasure.started.kind));
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

// The erasures each one reached, from the parent that started it. A joined child that another
// erasure started adds its edge when the tree grows.
function collectReached(tree: ReadonlyMap<string, OpenErasure>): Map<string, Set<string>> {
  const reached = new Map<string, Set<string>>();

  for (const erasure of tree.values()) {
    const parentID = erasure.started.parentID;

    if (parentID !== null) {
      addReached(reached, parentID, erasure.started.erasureID);
    }
  }

  return reached;
}

function addReached(reached: Map<string, Set<string>>, parentID: string, childID: string): void {
  const children = reached.get(parentID) ?? new Set<string>();

  children.add(childID);
  reached.set(parentID, children);
}

interface TreeKeys {
  readonly root: OpenErasure;
  readonly tree: Map<string, OpenErasure>;
  readonly reached: Map<string, Set<string>>;
  readonly removed: Set<string>;
  readonly lateKeyIDs: Set<string>;
}

// Steps 3 to 6: children, then revokes, then sandboxes, then keys, until a scan finds no child that
// is new.
async function removeTreeKeys(context: ErasureRunContext, state: TreeKeys): Promise<void> {
  const effects = context.effects;
  const rootID = state.root.started.erasureID;

  for (;;) {
    await growTree(context, state.tree, state.reached);

    const pending = [...state.tree.values()].filter(
      (erasure) => !state.removed.has(erasure.started.erasureID),
    );

    if (pending.length === 0) {
      return;
    }

    for (const erasure of pending) {
      await getEntry(context, erasure.started.kind).revoke(toTarget(erasure));
    }

    if (NIXIE_TEST_BUILD) {
      await effects.reachFaultPoint('erasure.revoked', rootID);
    }

    await effects.destroySandboxes(
      pending.flatMap((erasure) => erasure.started.capture.sandboxCallIDs),
    );

    if (NIXIE_TEST_BUILD) {
      await effects.reachFaultPoint('erasure.sandboxes_destroyed', rootID);
    }

    for (const erasure of pending) {
      const capture = erasure.started.capture;

      const late = await readLateKeyIDs(context, erasure);

      for (const keyID of late) {
        state.lateKeyIDs.add(keyID);
      }

      await removeErasureKeys(context.log, {
        keys: capture.keys,
        cleanupKeys: [...capture.cleanupKeys, ...late],
      });

      state.removed.add(erasure.started.erasureID);
    }

    if (NIXIE_TEST_BUILD) {
      await effects.reachFaultPoint('erasure.keys_removed', rootID);
    }
  }
}

// Finds the children of every erasure in the tree until a pass finds no target that is new. A
// target that already has an open erasure joins the tree, so shared and cyclic children finish once,
// and each erasure that reaches a child holds the parent's finish until the child's own.
async function growTree(
  context: ErasureRunContext,
  tree: Map<string, OpenErasure>,
  reached: Map<string, Set<string>>,
): Promise<void> {
  let isNew = true;

  while (isNew) {
    isNew = false;

    for (const erasure of tree.values()) {
      const entry = getEntry(context, erasure.started.kind);

      const children = await withWriteTransaction(context.log.writer, (tx) =>
        entry.readChildren(tx, toTarget(erasure)),
      );

      for (const child of children) {
        const known = [...tree.values()].find(
          (member) => buildTargetKey(toTarget(member)) === buildTargetKey(child),
        );

        if (known !== undefined) {
          addReached(reached, erasure.started.erasureID, known.started.erasureID);
          continue;
        }

        const outcome = await beginOrJoin(context, erasure, child);

        // A child that changed after it was read reads again, so its keys still go before the parent
        // finishes. A child that is gone has no keys.
        if (outcome.status === 'stale') {
          isNew = true;
        }

        if (outcome.status === 'joined') {
          tree.set(outcome.erasure.started.erasureID, outcome.erasure);

          addReached(reached, erasure.started.erasureID, outcome.erasure.started.erasureID);

          isNew = true;
        }
      }
    }
  }
}

function getEntry(context: ErasureRunContext, kind: ErasableKind): ErasureEntry {
  const entry = context.entries.get(kind);

  invariant(entry, `an erasable of kind ${kind} is registered`);

  return entry;
}

function toTarget(erasure: OpenErasure): ErasureTarget {
  return {
    kind: erasure.started.kind,
    targetID: erasure.started.targetID,
    version: erasure.started.version,
  };
}

function buildTargetKey(target: Pick<ErasureTarget, 'kind' | 'targetID'>): string {
  return `${target.kind}:${target.targetID}`;
}

type ChildOutcome =
  | { readonly status: 'joined'; readonly erasure: OpenErasure }
  | { readonly status: 'stale' }
  | { readonly status: 'gone' };

async function beginOrJoin(
  context: ErasureRunContext,
  parent: OpenErasure,
  child: ErasureTarget,
): Promise<ChildOutcome> {
  const open = await readOpenErasures(context.log);

  const existing = open.find(
    (erasure) => buildTargetKey(toTarget(erasure)) === buildTargetKey(child),
  );

  if (existing !== undefined) {
    return { status: 'joined', erasure: existing };
  }

  const begun = await getEntry(context, child.kind).beginChild(child, {
    erasureID: parent.started.erasureID,
    by: parent.started.by,
  });

  if (begun.status === 'refused') {
    return { status: begun.reason === 'stale' ? 'stale' : 'gone' };
  }

  const reread = await readOpenErasures(context.log);

  const started = reread.find((erasure) => erasure.started.erasureID === begun.erasureID);

  invariant(started, 'the child erasure that just began is open');

  return { status: 'joined', erasure: started };
}

function readLateKeyIDs(
  context: ErasureRunContext,
  erasure: OpenErasure,
): Promise<readonly string[]> {
  return withWriteTransaction(context.log.writer, (tx) =>
    getEntry(context, erasure.started.kind).readLateKeyIDs(
      tx,
      toTarget(erasure),
      erasure.started.capture,
    ),
  );
}

async function cleanErasure(context: ErasureRunContext, erasure: OpenErasure): Promise<void> {
  const capture = erasure.started.capture;

  await getEntry(context, erasure.started.kind).cleanIndexes(toTarget(erasure));

  const cause = capture.sessionCause;

  // A connection's token reaches no session, but the mail that its wakes showed does. Each wake
  // cleans the sessions of its thread as a forgotten record does.
  if ('connectionID' in cause || 'textID' in cause) {
    for (const sequence of cause.wakeSequences ?? []) {
      await context.effects.cleanupSessions({ recordSequence: sequence });
    }
  } else if ('sessions' in cause) {
    // No session holds the target's text, or the erasures of its children clean them.
  } else if ('recordSequence' in cause) {
    // Each destroyed call record names its own cleanup, so the sessions of the task that a brief
    // started and of its starter both rebuild. The forgotten record goes last, because its cleanup
    // also purges the memory items that quote it.
    for (const sequence of cause.callSequences ?? []) {
      await context.effects.cleanupSessions({ recordSequence: sequence });
    }

    await context.effects.cleanupSessions({ recordSequence: cause.recordSequence });
  } else {
    await context.effects.cleanupSessions(cause);
  }

  for (const purge of capture.purges) {
    await context.effects.finishPurges(purge.recordSequence);
  }
}

// Scans again for the keys of records written since the last scan, such as a record of the same
// place that landed during the cleanup, and removes them. Returns whether it found any that is new.
async function removeLateKeys(
  context: ErasureRunContext,
  tree: ReadonlyMap<string, OpenErasure>,
  seen: Set<string>,
): Promise<boolean> {
  const found: string[] = [];

  for (const erasure of tree.values()) {
    for (const keyID of await readLateKeyIDs(context, erasure)) {
      if (!seen.has(keyID)) {
        seen.add(keyID);
        found.push(keyID);
      }
    }
  }

  if (found.length === 0) {
    return false;
  }

  await removeErasureKeys(context.log, { keys: { ids: [] }, cleanupKeys: found });

  return true;
}

async function removeTurnInputs(effects: ErasureEffects, erasure: OpenErasure): Promise<void> {
  const capture = erasure.started.capture;
  const turnInputs = capture.turnInputs;

  if (turnInputs.threads === 'none') {
    return;
  }

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
