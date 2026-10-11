import type { APIContext } from '@heynixie/api';
import type { DefinitionsInForce, DefinitionsSource, SnapshotPolicy } from '@heynixie/definitions';
import type { ModelSecrets } from '@heynixie/models';
import type { Logger } from '@heynixie/ops';
import type { TasksContext } from '@heynixie/tasks';
import type { StartState } from './build-start-state';
import type { DeploymentConfig } from './deployment-config-schema';
import type { SandboxImages } from './load-sandbox-manifest';
import type { Tools } from './start-tools';

// The stops of every part the server started, run in reverse on a stop.
export interface Cleanup {
  // aborts when a stop begins, which ends the start sequence at its next step
  readonly signal: AbortSignal;

  // aborts the signal without stopping a part, so the start sequence ends before parts close
  readonly abort: () => void;

  // registers a part's stop, or runs it at once when the stop has begun
  readonly defer: (stop: () => Promise<void> | void) => Promise<void>;

  // stops every registered part, the last registered first
  readonly stop: () => Promise<void>;
}

// The definitions in force, which every record's snapshot hash and each turn's persona read.
export interface InForce {
  readonly read: () => DefinitionsInForce | null;
  readonly set: (inForce: DefinitionsInForce) => void;
}

// Everything the start steps behind the health endpoint use.
export interface ServerParts {
  readonly config: DeploymentConfig;
  readonly images: SandboxImages;
  readonly log: Logger;
  readonly cleanup: Cleanup;
  readonly state: StartState;
  readonly context: TasksContext;
  readonly apiContext: APIContext;
  readonly tools: Tools;
  readonly source: DefinitionsSource;
  readonly policy: SnapshotPolicy;
  readonly inForce: InForce;
  readonly modelSecrets: ModelSecrets;

  // a runner failed, such as when another process took the writer
  readonly onFailure: (error: unknown) => void;
}
