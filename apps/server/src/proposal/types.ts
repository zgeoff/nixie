import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import type { MemoryToolStore } from '@heynixie/memory';
import type { ProposalCoreDeps } from '@heynixie/proposals';

// What the model's tools to list and withdraw proposals need from the server.
export interface ProposalsToolDeps {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;

  // the core that answers and withdraws every family, built when a call needs it
  readonly readCore: () => ProposalCoreDeps;
  readonly readMemory: () => MemoryToolStore | null;

  // the name of each task that has one, by task ID
  readonly readTaskNames: () => Promise<ReadonlyMap<string, string>>;
}
