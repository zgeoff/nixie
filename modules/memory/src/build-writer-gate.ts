import invariant from 'tiny-invariant';
import { createBatchProposal } from './create-batch-proposal';
import { removeUnpublishedKeys } from './remove-unpublished-keys';
import { runBatchGate } from './run-batch-gate';
import type { StoreParts } from './types';
import type { GateVerdict, WriterGate } from './writer-types';

// The gate of the memory writer's batches. A staged write that passes the checks against the
// message it cites applies with that message as its evidence; every other write becomes a proposal.
export function buildWriterGate(parts: StoreParts): WriterGate {
  // the new item each proposal created a key for, which release removes when it never published
  const newItems = new WeakMap<GateVerdict, string>();

  return {
    check: async (write, source, batch) => {
      const checked = await runBatchGate(parts, write, source);
      const gate = checked.gate;

      if (gate.status === 'pass') {
        // every batch check is quoted, and a quoted check passes only with the quote's place
        invariant(gate.evidence, 'a batch write passed with no evidence');
        return {
          outcome: 'apply',
          source: gate.source,
          checks: gate.checks,
          evidence: gate.evidence,
        };
      }
      const proposal = await createBatchProposal(
        parts,
        { write, review: gate, text: checked.text },
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
