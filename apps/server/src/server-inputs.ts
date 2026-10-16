import type { ServerPartsOptions } from './start-server';
import type { Cleanup } from './types';

// What the server's parts start from: the loaded inputs and the open writer, the cleanup that a
// reset runs, and the failure that ends the server.
export interface ServerInputs {
  readonly options: ServerPartsOptions;

  // the stops of the parts behind the health endpoint, which a reset runs and the writer outlives
  readonly work: Cleanup;
  readonly onFailure: (error: unknown) => void;
}
