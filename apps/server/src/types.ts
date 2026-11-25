import type { APIContext } from '@heynixie/api';
import type { HostContractClient } from '@heynixie/contract';
import type { DefinitionsInForce, DefinitionsSource } from '@heynixie/definitions';
import type { Logger } from '@heynixie/logger';
import type { Encoder } from '@heynixie/memory';
import type { ModelCredentials } from '@heynixie/models';
import type { SandboxAdapter, SandboxImageKey } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { TurnInputs } from '@heynixie/turn-inputs';
import type { HeldSlot } from './credential/create-held-slot';
import type { DeploymentConfig } from './deployment/deployment-config-schema';
import type { Tools } from './part/tools';
import type { SandboxAdapterOptions } from './sandbox/create-sandbox-adapter';
import type { SandboxImages } from './sandbox/load-sandbox-manifest';
import type { SeedInputs } from './seed/build-seed-inputs';
import type { TestCredentialSite } from './server/build-test-credential-checks';
import type { CrashHarness } from './server/join-crash-harness';
import type { SpendInputs } from './spend/create-spend-inputs';
import type { StartState } from './utils/build-start-state';
import type { DecisionPointFactory } from './utils/make-server-decisions';

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
  readonly decisions: DecisionPointFactory;
  readonly source: DefinitionsSource;
  readonly buildPolicy: SeedInputs['buildPolicy'];
  readonly tasks: SeedInputs['tasks'];
  readonly inForce: InForce;
  readonly credentials: ModelCredentials;
  readonly heldSlot: HeldSlot;

  // the gateway that counts every model request, or null when the config sets no spendStop
  readonly spend: SpendInputs | null;

  // whether the start checks left the gateway without its limits
  readonly isSpendUnanswered: boolean;
  readonly turnInputs: TurnInputs;

  readonly encoder: Encoder | null;

  readonly onFailure: (error: unknown) => void;
}

export interface CLIIO {
  readonly log: Logger;

  readonly print: (text: string) => void;

  // writes bytes to stdout as they are, with no newline
  readonly writeBytes?: (bytes: Uint8Array) => void;

  readonly waitForSignal: () => Promise<string>;

  readonly createSandboxAdapter?: (options: SandboxAdapterOptions) => SandboxAdapter;

  readonly harness?: CrashHarness;

  readonly credentialSite?: TestCredentialSite;
}

export interface CLIFlags {
  readonly config: string;
  readonly manifest: string;
  readonly needed: boolean;
  readonly sops: string;
  readonly encoder: string;
  readonly live: boolean;

  readonly hash?: string;

  readonly revise?: string;
  readonly 'as-new': boolean;

  readonly text?: string;

  readonly reason?: string;

  readonly name?: string;

  readonly destination?: string;
  readonly contactID?: string;

  readonly files?: string;

  readonly entry?: string;

  readonly keep?: 'nixie' | 'definitions' | 'repo';

  readonly 'keep-sessions': boolean;
  readonly only?: 'memories' | 'conversations';
  readonly yes: boolean;

  readonly 'dry-run': boolean;
  readonly database?: string;

  readonly to?: string;
  readonly from?: string;

  readonly turns?: number;
  readonly dollars?: number;

  readonly for?: string;
  readonly drop?: boolean;
  readonly limit?: number;
  readonly inputID?: string;

  readonly taskID?: string;
  readonly ruleID?: string;
  readonly definitionID?: string;
  readonly mandateID?: string;
  readonly budgetID?: string;
  readonly proposalID?: string;
}

export type Command = (flags: CLIFlags, io: CLIIO, args: readonly string[]) => Promise<number>;

export interface HostTransport {
  readonly resolveSocketPath: (configPath: string) => Promise<string>;

  readonly sendHostRequest: <Answer>(
    socketPath: string,
    name: string,
    call: (client: HostContractClient) => Promise<Answer>,
  ) => Promise<Answer>;
}

export interface PartReader<Values> {
  readonly get: <Name extends keyof Values>(name: Name) => Values[Name];

  readonly find: <Name extends keyof Values>(name: Name) => Values[Name] | null;

  readonly waitFor: <Name extends keyof Values>(name: Name) => Promise<Values[Name]>;
}

export interface PartDeclaration<Values, Name extends keyof Values> {
  readonly name: Name;
  readonly needs: readonly (keyof Values)[];
  readonly uses?: readonly (keyof Values)[];

  // The image keys this part picks for itself, so nixie adds them and refuses to start without
  // them. A part whose image comes from a harness record declares none: its profile's need
  // covers it.
  readonly images?: (config: DeploymentConfig) => readonly SandboxImageKey[];

  // The image keys this part uses when the sandbox manifest holds them. nixie adds each one the
  // manifest holds and starts without the rest, so the part reads a missing image as its own
  // absence.
  readonly optionalImages?: (config: DeploymentConfig) => readonly SandboxImageKey[];

  readonly start: (parts: PartReader<Values>) => Promise<Values[Name]>;
}

export type AnyPartDeclaration<Values> = {
  [Name in keyof Values]: PartDeclaration<Values, Name>;
}[keyof Values];

export interface PartGraph<Values> {
  readonly waitFor: PartReader<Values>['waitFor'];

  readonly done: Promise<void>;
}

// A type alias, because a record's payload needs the index signature that an interface lacks.
export type StartOutage = Readonly<{
  downAtMs: number;
  upAtMs: number;
  downSequence: number;
}>;
