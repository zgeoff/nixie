import type { APIContext, ReadViewMemory } from '../types';
import { createMemoryChangeProcedures } from './create-memory-change-procedures';
import { createMemoryExportProcedures } from './create-memory-export-procedures';
import { createMemoryNoticeProcedures } from './create-memory-notice-procedures';
import { createMemoryViewProcedures } from './create-memory-view-procedures';

export function createMemoryViewRouter(context: APIContext, readMemory: ReadViewMemory) {
  return {
    ...createMemoryViewProcedures(context, readMemory),
    ...createMemoryChangeProcedures(context, readMemory),
    ...createMemoryNoticeProcedures(context, readMemory),
    ...createMemoryExportProcedures(context, readMemory),
  };
}
