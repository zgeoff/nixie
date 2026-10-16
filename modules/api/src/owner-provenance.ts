import type { Provenance } from '@heynixie/memory';

// your own change from the memory view, as in the host commands: you are its origin and its source
export const ownerProvenance: Provenance = {
  origin: 'owner',
  source: 'owner',
  taskID: null,
  proposalID: null,
  checks: null,
};
