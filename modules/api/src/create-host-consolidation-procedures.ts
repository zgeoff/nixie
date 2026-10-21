import type { ConsolidationDiff } from '@heynixie/memory';
import { hostImplementer } from './host-implementer';
import { requireHostMemory } from './require-host-memory';
import type { ReadHostMemory } from './types';

export function createHostConsolidationProcedures(readMemory: ReadHostMemory) {
  const consolidation = hostImplementer.memory.consolidation;

  return {
    read: consolidation.read.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const diff = await memory.readDiff();

      return diff === null ? null : buildDiffEntry(diff);
    }),

    approve: consolidation.approve.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const outcomes = await memory.approveChanges(options.input.answers);

      return {
        outcomes: outcomes.map((outcome) =>
          outcome.status === 'applied'
            ? {
                changeID: outcome.changeID,
                status: outcome.status,
                versions: [...outcome.versions],
              }
            : { changeID: outcome.changeID, status: outcome.status, code: outcome.code },
        ),
      };
    }),

    reject: consolidation.reject.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      await memory.rejectChange(options.input);

      return { changeID: options.input.changeID };
    }),
  };
}

function buildDiffEntry(diff: ConsolidationDiff) {
  return {
    diffID: diff.diffID,
    model: diff.model,
    createdAt: new Date(diff.createdAt),
    changes: diff.changes.map((change) => ({
      changeID: change.changeID,
      shortID: change.shortID,
      kind: change.kind,
      inputs: [...change.inputs],
      text: change.text,
      reason: change.reason,
      source: change.source,
      actionHash: change.actionHash,
      lapseAt: new Date(change.lapseAt),
      comment:
        change.comment === null
          ? null
          : { text: change.comment.text, at: new Date(change.comment.at) },
    })),
    summary: diff.summary?.text ?? null,
  };
}
