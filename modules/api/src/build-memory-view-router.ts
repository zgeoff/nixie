import { buildMemoryChangeProcedures } from './build-memory-change-procedures';
import { buildMemoryProposalProcedures } from './build-memory-proposal-procedures';
import { buildMemoryViewProcedures } from './build-memory-view-procedures';
import type { APIContext, ReadViewMemory } from './types';

// Builds the memory view's procedures, which reach the memory store once the start sequence fills
// it: its reads, your changes to an item, and your answers to the pending proposals.
export function buildMemoryViewRouter(context: APIContext, readMemory: ReadViewMemory) {
  return {
    ...buildMemoryViewProcedures(context, readMemory),
    ...buildMemoryChangeProcedures(context, readMemory),
    ...buildMemoryProposalProcedures(context, readMemory),
  };
}
