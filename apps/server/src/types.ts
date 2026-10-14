import type { APIContext } from '@heynixie/api';
import type { DefinitionsInForce, DefinitionsSource, SnapshotPolicy } from '@heynixie/definitions';
import type { StartedMemoryStore } from '@heynixie/memory';
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

// the slot the memory tools and the conversation read the memory store from, empty until it starts
export interface MemorySlot {
  readonly read: () => StartedMemoryStore | null;
  readonly set: (store: StartedMemoryStore) => void;
}

// What the server holds once the health endpoint listens.
export interface ServerBase {
  readonly apiContext: APIContext;
  readonly inForce: InForce;
  readonly state: StartState;
  readonly tools: Tools;
  readonly port: number;
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

// What a command of the nixie binary reaches: the log, the printed answer and the stop signal.
export interface CLIIO {
  // the JSON log, on stdout
  readonly log: Logger;

  // a host command's answer for a person, on stdout
  readonly print: (text: string) => void;

  // resolves when the process receives SIGTERM or SIGINT
  readonly waitForSignal: () => Promise<string>;
}

export interface CLIFlags {
  readonly config: string;
  readonly manifest: string;
  readonly sops: string;
  readonly live: boolean;

  // the action hash a memory answer binds to
  readonly hash?: string;

  // an approval held for a close match: apply it as a revision of <itemID>@<version>, or as a new
  // item anyway
  readonly revise?: string;
  readonly 'as-new': boolean;

  // an edit's new text, or an approval's text in place of the proposal's
  readonly text?: string;

  // a reset keeps the live device sessions, and runs only once the user confirms it
  readonly 'keep-sessions': boolean;
  readonly yes: boolean;
}

export type Command = (flags: CLIFlags, io: CLIIO, args: readonly string[]) => Promise<number>;
