import type { Definitions, JSONObject, Log, RecordInput } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import { buildConsolidationHash } from './build-consolidation-hash';
import type { StagedChange } from './consolidation-types';
import { encodeChangeText } from './encode-change-text';
import { encodeConsolidationSummary } from './encode-consolidation-summary';

export interface PlannedSummary {
  readonly text: string;
  readonly itemIDs: readonly string[];
}

export interface DiffPlan {
  readonly changes: readonly StagedChange[];

  readonly model: string | null;
  readonly shownItems: number;

  readonly summary: PlannedSummary | null;
  readonly now: number;
  readonly lapseMs: number;
  readonly definitions: Definitions;
}

export async function planDiffRecord(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  plan: DiffPlan,
): Promise<readonly RecordInput[]> {
  const keys = await readRecordKeys(
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

  const diffID = crypto.randomUUID();

  const proposed: RecordInput = {
    kind: 'memory.consolidation_proposed',
    definitions: plan.definitions,
    payload: {
      diffID,

      at: plan.now,
      model: plan.model,
      shownItems: plan.shownItems,
      changes: sealed.filter((change) => change !== null),
    },
  };

  const summary =
    plan.summary === null
      ? null
      : await planSummaryRecord(log, diffID, { ...plan, summary: plan.summary });

  return summary === null ? [proposed] : [proposed, summary];
}

const saltBytes = 16;

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

async function planSummaryRecord(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  diffID: string,
  plan: DiffPlan & { readonly summary: PlannedSummary },
): Promise<RecordInput | null> {
  const planned = plan.summary;

  const found = await readRecordKeys(log, planned.itemIDs);

  const keys = new Map(
    [...found].flatMap(([itemID, key]) => (key === null ? [] : [[itemID, key] as const])),
  );

  if (keys.size === 0 || keys.size < new Set(planned.itemIDs).size) {
    return null;
  }

  const summary = await encodeConsolidationSummary(diffID, planned.text, keys);

  return {
    kind: 'memory.consolidation_summarized',
    definitions: plan.definitions,
    payload: {
      diffID,
      sealed: summary.sealed,
      shares: summary.shares.map((share) => ({ itemID: share.itemID, sealed: share.sealed })),
      lapseAt: plan.now + plan.lapseMs,
    },
  };
}
