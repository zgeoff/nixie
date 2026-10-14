import type { Definitions, JSONObject, Log, RecordInput } from '@heynixie/log';
import { findRecordKeys } from '@heynixie/log';
import { buildConsolidationHash } from './build-consolidation-hash';
import type { StagedChange } from './consolidation-types';
import { encodeChangeText } from './encode-change-text';

export interface DiffPlan {
  readonly changes: readonly StagedChange[];

  // the model of the session that staged the diff, or null for a run that needed none
  readonly model: string | null;
  readonly shownItems: number;
  readonly now: number;
  readonly lapseMs: number;
  readonly definitions: Definitions;
}

// Plans the one record that proposes a run's diff: each change sealed under its first input's
// key, with its action hash over the versions it read. A change whose first input lost its key
// since the session read it, as after a forget, drops out, because no key is left to seal it.
export async function planDiffRecord(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  plan: DiffPlan,
): Promise<RecordInput> {
  const keys = await findRecordKeys(
    log,
    plan.changes.flatMap((change) => change.inputs.slice(0, 1).map((input) => input.itemID)),
  );
  const sealed = await Promise.all(
    plan.changes.map((change) => {
      const key = keys.get(change.inputs[0].itemID);

      return key === null || key === undefined
        ? Promise.resolve(null)
        : encodeChange(key, change, plan);
    }),
  );

  return {
    kind: 'memory.consolidation_proposed',
    definitions: plan.definitions,
    payload: {
      diffID: crypto.randomUUID(),

      // the task runtime's clock, which the schedule reads, and not the record's wall-clock time
      at: plan.now,
      model: plan.model,
      shownItems: plan.shownItems,
      changes: sealed.filter((change) => change !== null),
    },
  };
}

async function encodeChange(
  key: CryptoKey,
  change: StagedChange,
  plan: DiffPlan,
): Promise<JSONObject> {
  const changeID = crypto.randomUUID();
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(saltBytes))).toString('base64');
  const text = change.kind === 'retire' ? null : change.text;
  const inputs = change.inputs.map((input) => ({ itemID: input.itemID, version: input.version }));

  return {
    changeID,
    kind: change.kind,
    itemID: change.inputs[0].itemID,
    inputs,
    source: change.source,
    actionHash: buildConsolidationHash({ kind: change.kind, inputs, text, salt }),
    sealed: await encodeChangeText(key, changeID, { text, reason: change.reason, salt }),
    lapseAt: plan.now + plan.lapseMs,
  };
}

const saltBytes = 16;
