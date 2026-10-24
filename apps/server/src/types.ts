import type { APIContext } from '@heynixie/api';
import type { DefinitionsInForce, DefinitionsSource } from '@heynixie/definitions';
import type { Logger } from '@heynixie/logger';
import type { Encoder } from '@heynixie/memory';
import type { ModelSecrets } from '@heynixie/models';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { SeedInputs } from './build-seed-inputs';
import type { StartState } from './build-start-state';
import type { SandboxAdapterOptions } from './create-sandbox-adapter';
import type { DeploymentConfig } from './deployment-config-schema';
import type { CrashHarness } from './join-crash-harness';
import type { SandboxImages } from './load-sandbox-manifest';
import type { Tools } from './tools';

export interface Cleanup {
  readonly signal: AbortSignal;

  readonly abort: () => void;

  readonly defer: (stop: () => Promise<void> | void) => Promise<void>;

  readonly stop: () => Promise<void>;
}

export interface InForce {
  readonly read: () => DefinitionsInForce | null;
  readonly set: (inForce: DefinitionsInForce) => void;
}

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
  readonly buildPolicy: SeedInputs['buildPolicy'];
  readonly inForce: InForce;
  readonly modelSecrets: ModelSecrets;

  readonly encoder: Encoder | null;

  readonly onFailure: (error: unknown) => void;
}

export interface CLIIO {
  readonly log: Logger;

  readonly print: (text: string) => void;

  readonly waitForSignal: () => Promise<string>;

  readonly createSandboxAdapter?: (options: SandboxAdapterOptions) => SandboxAdapter;

  readonly harness?: CrashHarness;
}

export interface CLIFlags {
  readonly config: string;
  readonly manifest: string;
  readonly sops: string;
  readonly encoder: string;
  readonly live: boolean;

  readonly hash?: string;

  readonly revise?: string;
  readonly 'as-new': boolean;

  readonly text?: string;

  readonly reason?: string;

  readonly files?: string;

  readonly entry?: string;

  readonly keep?: 'nixie' | 'definitions';

  readonly 'keep-sessions': boolean;
  readonly yes: boolean;

  readonly 'dry-run': boolean;
  readonly database?: string;

  readonly to?: string;
  readonly from?: string;
}

export type Command = (flags: CLIFlags, io: CLIIO, args: readonly string[]) => Promise<number>;

export interface PartReader<Values> {
  readonly get: <Name extends keyof Values>(name: Name) => Values[Name];

  readonly find: <Name extends keyof Values>(name: Name) => Values[Name] | null;

  readonly waitFor: <Name extends keyof Values>(name: Name) => Promise<Values[Name]>;
}

export interface PartDeclaration<Values, Name extends keyof Values> {
  readonly name: Name;
  readonly needs: readonly (keyof Values)[];
  readonly uses?: readonly (keyof Values)[];

  readonly start: (parts: PartReader<Values>) => Promise<Values[Name]>;
}

export type AnyPartDeclaration<Values> = {
  [Name in keyof Values]: PartDeclaration<Values, Name>;
}[keyof Values];

export interface PartGraph<Values> {
  readonly waitFor: PartReader<Values>['waitFor'];

  readonly done: Promise<void>;
}
