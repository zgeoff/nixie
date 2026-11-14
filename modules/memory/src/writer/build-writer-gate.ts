import { createBatchProposal } from '../batch/create-batch-proposal';
import { runBatchGate } from '../batch/run-batch-gate';
import type { StoreParts } from '../types';
import { removeUnpublishedKeys } from './remove-unpublished-keys';
import type { GateVerdict, WriterGate } from './writer-model';

export function buildWriterGate(parts: StoreParts): WriterGate {
  const newItems = new WeakMap<GateVerdict, string>();

  return {
    check: async (write, source, batch) => {
      const checked = await runBatchGate(parts, write, source);

      if (checked === null) {
        return null;
      }

      const gate = checked.gate;

      if (gate.status === 'pass') {
        return {
          outcome: 'apply',
          source: gate.source,
          checks: gate.checks,
          evidence: gate.evidence,
          model: batch.model,
        };
      }

      const proposal = await createBatchProposal(
        parts,
        {
          write,
          review: gate,
          text: checked.text,
          ...(checked.until === undefined ? {} : { until: checked.until }),
        },
        batch,
      );

      if (proposal.newItemID !== null) {
        newItems.set(proposal.verdict, proposal.newItemID);
      }

      return proposal.verdict;
    },
    release: (verdicts) =>
      removeUnpublishedKeys(
        parts,
        verdicts.flatMap((verdict) => newItems.get(verdict) ?? []),
      ),
  };
}
