import { mockMemoryExportProcedures } from './mock-memory-export-procedures';
import { mockMemoryForgetProcedures } from './mock-memory-forget-procedures';
import { mockMemoryProcedures } from './mock-memory-procedures';
import { mockMomentProcedures } from './mock-moment-procedures';

export const mockMemoryRouter = {
  ...mockMemoryProcedures,
  ...mockMemoryForgetProcedures,
  ...mockMemoryExportProcedures,
  ...mockMomentProcedures,
};
