import { createMemoryChangeProcedures } from './create-memory-change-procedures';
import { createMemoryExportProcedures } from './create-memory-export-procedures';
import { createMemoryProposalProcedures } from './create-memory-proposal-procedures';
import { createMemoryViewProcedures } from './create-memory-view-procedures';
import type { APIContext, ReadViewMemory } from './types';

export function createMemoryViewRouter(context: APIContext, readMemory: ReadViewMemory) {
  return {
    ...createMemoryViewProcedures(context, readMemory),
    ...createMemoryChangeProcedures(context, readMemory),
    ...createMemoryProposalProcedures(context, readMemory),
    ...createMemoryExportProcedures(context, readMemory),
  };
}
