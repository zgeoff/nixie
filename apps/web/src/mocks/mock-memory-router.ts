import { mockMemoryExportProcedures } from './mock-memory-export-procedures';
import { mockMemoryForgetProcedures } from './mock-memory-forget-procedures';
import { mockMemoryProcedures } from './mock-memory-procedures';
import { mockProposalProcedures } from './mock-proposal-procedures';

// Every memory procedure over the mock store: the reads and changes of the memory view, the answers
// to proposals, the forget and the export.
export const mockMemoryRouter = {
  ...mockMemoryProcedures,
  ...mockProposalProcedures,
  ...mockMemoryForgetProcedures,
  ...mockMemoryExportProcedures,
};
