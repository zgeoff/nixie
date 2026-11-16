import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { Harness, ResolvedProfile, WorkerRunLimits } from '@heynixie/models';
import type {
  GrantSpec,
  GuestCommand,
  Sandbox,
  SandboxAdapter,
  SandboxLimits,
} from '@heynixie/sandbox';
import type { ToolEndpoint, ToolRun, ToolStepHold } from '@heynixie/tools';
import type { WorkerUsed } from './worker-used';

// Everything about a call that runWorker needs, which planWorkerRun made from the call and the
// config. runWorker takes no raw tool list.
export interface WorkerPlan {
  readonly question: string;

  // nixie's own names of the tools the worker holds
  readonly tools: readonly string[];
  readonly limits: WorkerRunLimits;

  // whether the dollars are what the caller had left
  readonly isTaskLimit: boolean;

  // when the call began, which the minutes count from
  readonly calledAt: number;
  readonly hold: ToolStepHold;
  readonly caller: WorkerCaller;
}

interface WorkerCaller {
  readonly callID: string;
  readonly callSequence: number;
  readonly stepRunID: string;
  readonly thread: string;
  readonly logThread: string;
  readonly taskRun?: ToolRun['taskRun'];
}

// what each record of one worker run names it by
export interface WorkerRunNames {
  readonly workerRunID: string;
  readonly shortID: string;
  readonly model: string;
  readonly profile: string;
}

export type WorkerEnd =
  | { readonly outcome: 'answered'; readonly answer: string }
  | {
      readonly outcome: 'limit';
      readonly limit: 'minutes' | 'turns' | 'tokens' | 'dollars';
    }
  | { readonly outcome: 'sandbox_failed'; readonly detail: string }
  | { readonly outcome: 'model_failed'; readonly detail: string }
  | { readonly outcome: 'interrupted' }
  | { readonly outcome: 'no_answer' }
  | { readonly outcome: 'aborted' };

export type WorkerResult =
  | {
      readonly kind: 'answered';
      readonly shortID: string;
      readonly answer: string;
      readonly used: WorkerUsed;
    }
  | { readonly kind: 'stopped'; readonly sentence: string };

export type WorkerSlotGrant =
  | {
      readonly kind: 'granted';

      // frees the slot, and lets the first call that waits for one start
      readonly release: () => void;
    }
  | { readonly kind: 'full'; readonly max: number };

export interface WorkerSlots {
  // a call under a cap that answers an error gets 'full' at once, and a call that waits gets its
  // slot in the order the calls came, or the stop's reason when the signal aborts first
  readonly acquire: (signal: AbortSignal) => Promise<WorkerSlotGrant>;
}

export interface WorkerDeps {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly logger: Logger;

  readonly sandboxes: Pick<SandboxAdapter, 'create'>;

  // null while no endpoint runs
  readonly readTools: () => Pick<ToolEndpoint, 'startRun'> | null;
  readonly profile: ResolvedProfile;
  readonly harness: Harness;
  readonly image: string;
  readonly size: SandboxLimits;
  readonly modelGrant: GrantSpec;
  readonly command: GuestCommand;
  readonly slots: WorkerSlots;

  // the sandboxes whose destroy failed, which the next worker run tries again before its create
  readonly failedDestroys: Sandbox[];

  // the destroys in flight, which a stop waits for
  readonly cleanups: Set<Promise<void>>;
}
