import type { ServerPartsOptions } from '../server/start-server';
import type { Cleanup } from '../types';

export interface ServerInputs {
  readonly options: ServerPartsOptions;

  readonly work: Cleanup;
  readonly onFailure: (error: unknown) => void;
}
