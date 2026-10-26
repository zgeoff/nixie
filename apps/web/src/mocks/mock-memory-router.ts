import { mockMemoryExportProcedures } from './mock-memory-export-procedures';
import { mockMemoryForgetProcedures } from './mock-memory-forget-procedures';
import { mockMemoryProcedures } from './mock-memory-procedures';
import { mockMomentProcedures } from './mock-moment-procedures';
import { mockProposalProcedures } from './mock-proposal-procedures';

export const mockMemoryRouter = {
  ...mockMemoryProcedures,
  ...mockProposalProcedures,
  ...mockMemoryForgetProcedures,
  ...mockMemoryExportProcedures,
  ...mockMomentProcedures,
};
