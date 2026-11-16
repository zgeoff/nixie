import { DefinitionsParseError } from '../utils/definitions-parse-error';
import type { SeedFault } from './types';

export class TaskSeedRefusedError extends DefinitionsParseError {
  override readonly name = 'TaskSeedRefusedError';

  readonly faults: readonly SeedFault[];

  constructor(faults: readonly SeedFault[]) {
    super(
      faults.map((fault) => ({
        path: fault.path,
        reason:
          fault.reasons.length === 0 ? fault.fault : `${fault.fault}: ${fault.reasons.join('; ')}`,
      })),
    );

    this.faults = faults;
  }
}
