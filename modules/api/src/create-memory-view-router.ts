import { createMemoryChangeProcedures } from './create-memory-change-procedures';
import { createMemoryExportProcedures } from './create-memory-export-procedures';
import { createMemoryProposalProcedures } from './create-memory-proposal-procedures';
import { createMemoryViewProcedures } from './create-memory-view-procedures';
import type { APIContext, ReadViewMemory } from './types';

// Builds the memory view's procedures, which reach the memory store once the start sequence fills
// it: its reads, your changes to an item, your answers to the pending proposals, and the export.
export function createMemoryViewRouter(context: APIContext, readMemory: ReadViewMemory) {
  return {
    ...createMemoryViewProcedures(context, readMemory),
    ...createMemoryChangeProcedures(context, readMemory),
    ...createMemoryProposalProcedures(context, readMemory),
    ...createMemoryExportProcedures(context, readMemory),
  };
}
