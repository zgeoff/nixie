import type { APIContext } from '@heynixie/api';
import type { DefinitionsInForce, DefinitionsSource, SnapshotPolicy } from '@heynixie/definitions';
import type { Logger } from '@heynixie/logger';
import type { Encoder } from '@heynixie/memory';
import type { ModelSecrets } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import type { StartState } from './build-start-state';
import type { DeploymentConfig } from './deployment-config-schema';
import type { SandboxImages } from './load-sandbox-manifest';
import type { Tools } from './tools';

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

  // the encoder the memory store's vector index runs, or null for keyword search alone
  readonly encoder: Encoder | null;

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
  readonly encoder: string;
  readonly live: boolean;

  // the action hash a memory answer binds to, or the skill hash a skill answer binds to
  readonly hash?: string;

  // an approval held for a close match: apply it as a revision of <itemID>@<version>, or as a new
  // item anyway
  readonly revise?: string;
  readonly 'as-new': boolean;

  // an edit's new text, or an approval's text in place of the proposal's
  readonly text?: string;

  // a rejection's reason, which the conversation reads in its next turn
  readonly reason?: string;

  // the pull request on the definitions that carries an approved skill
  readonly 'pull-request'?: string;

  // a reset keeps the live device sessions, and runs only once the user confirms it
  readonly 'keep-sessions': boolean;
  readonly yes: boolean;

  // the subjects migration's dry run, on a copy of the database file at database
  readonly 'dry-run': boolean;
  readonly database?: string;
}

export type Command = (flags: CLIFlags, io: CLIIO, args: readonly string[]) => Promise<number>;

// What a part's start reads of the parts the graph started.
export interface PartReader<Values> {
  // a started part's value; it throws for a part that has not started
  readonly get: <Name extends keyof Values>(name: Name) => Values[Name];

  // a started part's value, or null for a part that has not started
  readonly find: <Name extends keyof Values>(name: Name) => Values[Name] | null;

  // resolves with the part's value once it is ready, and rejects when the start fails before it
  readonly waitFor: <Name extends keyof Values>(name: Name) => Promise<Values[Name]>;
}

// One part of a start: the parts it needs, which start before it, and the parts it uses, which it
// reads only later, such as from a callback, so they may start after it.
export interface PartDeclaration<Values, Name extends keyof Values> {
  readonly name: Name;
  readonly needs: readonly (keyof Values)[];
  readonly uses?: readonly (keyof Values)[];

  // starts the part and resolves with its value once it is ready, which starts the parts that need it
  readonly start: (parts: PartReader<Values>) => Promise<Values[Name]>;
}

export type AnyPartDeclaration<Values> = {
  [Name in keyof Values]: PartDeclaration<Values, Name>;
}[keyof Values];

// The parts a graph starts, each read by name.
export interface PartGraph<Values> {
  readonly waitFor: PartReader<Values>['waitFor'];

  // resolves once every part is ready, and rejects with the error that ended the start
  readonly done: Promise<void>;
}

// The conversation guest's entry a sandbox runs: a session, or one check for the checker.
export type GuestEntry = 'check' | 'main';
