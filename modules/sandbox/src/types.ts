import type { CheckedTables } from '@heynixie/db';

export type SandboxKind = 'conversation' | 'checker' | 'worker' | 'code_run' | 'fetch' | 'coding';

export type Egress =
  | { readonly kind: 'none' }
  | { readonly kind: 'public' }
  | { readonly kind: 'allow'; readonly hosts: readonly string[] };

export interface GrantSpec {
  readonly secret: string;
  readonly host: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface SecretSpec {
  readonly name: string;
  readonly value: string;
  readonly host: string;
  readonly header: 'bearer' | 'x-api-key';
}

export interface SandboxLimits {
  readonly vcpus: number;
  readonly memoryMiB: number;
  readonly diskMiB: number;
}

export interface SandboxSpec {
  readonly kind: SandboxKind;

  readonly image: string;

  readonly owner: string;
  readonly egress: Egress;

  readonly grants: readonly GrantSpec[];

  readonly toolRoute: boolean;
  readonly limits: SandboxLimits;
}

export interface SandboxAdapter {
  readonly id: string;
  readonly boundary: 'microvm' | 'container' | 'process';
  readonly create: (spec: SandboxSpec) => Promise<Sandbox>;
  readonly read: (id: string) => Promise<Sandbox | null>;

  readonly list: (owner: string) => Promise<readonly Sandbox[]>;

  readonly addSecret: (secret: SecretSpec) => Promise<void>;

  readonly addImage: (image: SandboxImage) => Promise<void>;

  readonly checkRuntime: (signal?: AbortSignal) => Promise<RuntimeReport>;
}

export interface SandboxImage {
  readonly name: string;
  readonly ref: string;
}

export interface RuntimeReport {
  readonly isReady: boolean;
  readonly reason: string | null;
}

export interface GuestCommand {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface ExecSpec {
  readonly argv: readonly string[];

  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

export interface RunSpec extends ExecSpec {
  readonly stdin?: Uint8Array;
}

export interface SpawnSpec extends ExecSpec {
  readonly maxMessageBytes: number;
}

export interface CollectedOutput {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly totalBytes: number;
  readonly isCut: boolean;
}

export interface ExecExit {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface ExecResult extends ExecExit {
  readonly stdout: CollectedOutput;
  readonly stderr: CollectedOutput;
  readonly durationMs: number;
}

export interface StreamExit extends ExecExit {
  readonly stderr: CollectedOutput;
}

export interface ExecStream {
  readonly messages: AsyncIterable<Uint8Array<ArrayBuffer>>;
  readonly send: (message: Uint8Array) => Promise<void>;
  readonly exit: Promise<StreamExit>;

  readonly stop: () => Promise<StreamExit>;
}

export interface FileSpec {
  readonly path: string;
  readonly content: Uint8Array<ArrayBuffer>;
}

export interface ToolRoute {
  readonly url: string;
}

export type ToolTarget =
  | { readonly path: string }
  | { readonly host: string; readonly port: number };

export interface SandboxRef {
  readonly id: string;
  readonly owner: string;
}

export type ToolTargetResolver = (sandbox: SandboxRef) => ToolTarget;

export type Suspension =
  | {
      readonly kind: 'memory';
      readonly sleep: () => Promise<void>;
      readonly wake: () => Promise<void>;
    }
  | { readonly kind: 'none' };

export interface GuestHome {
  readonly copyPath: string;

  readonly ownPath: string;
}

export interface ReadFilePathsOptions {
  readonly maxDepth?: number;
}

export interface Sandbox {
  readonly id: string;
  readonly spec: SandboxSpec;
  readonly exec: (command: RunSpec, signal?: AbortSignal) => Promise<ExecResult>;
  readonly spawn: (command: SpawnSpec) => Promise<ExecStream>;
  readonly copyIn: (files: readonly FileSpec[]) => Promise<void>;
  readonly copyOut: (paths: readonly string[]) => Promise<readonly FileSpec[]>;

  readonly resolveHome: (env: Readonly<Record<string, string>>) => Promise<GuestHome>;

  readonly readFilePaths: (
    directory: string,
    options?: ReadFilePathsOptions,
  ) => Promise<readonly string[]>;

  readonly applyMove: (from: string, to: string) => Promise<void>;
  readonly toolRoute: () => Promise<ToolRoute | null>;
  readonly suspension: Suspension;
  readonly destroy: () => Promise<void>;

  readonly isRetired: boolean;
}

export type SandboxEvent =
  | {
      readonly event: 'created';
      readonly sandboxID: string;
      readonly adapter: string;
      readonly spec: SandboxSpec;
    }
  | {
      readonly event: 'granted';
      readonly sandboxID: string;
      readonly secret: string;
      readonly host: string;
    }
  | { readonly event: 'slept' | 'woken'; readonly sandboxID: string }
  | {
      readonly event: 'destroyed';
      readonly sandboxID: string;
      readonly reason: 'destroyed' | 'create_failed';
    };

export interface SandboxRow {
  readonly sandboxID: string;
  readonly adapter: string;
  readonly owner: string;
  readonly state: 'awake' | 'sleeping';
  readonly spec: SandboxSpec;
}

export interface SandboxRecorder {
  readonly write: (event: SandboxEvent) => Promise<void>;
  readonly readRow: (adapter: string, sandboxID: string) => Promise<SandboxRow | null>;
  readonly list: (adapter: string, owner: string) => Promise<readonly SandboxRow[]>;
}

export type SandboxTables = CheckedTables<
  Readonly<{
    sandboxes: {
      readonly sandbox_id: string;
      readonly adapter: string;
      readonly owner: string;
      readonly kind: string;
      readonly state: 'awake' | 'sleeping';
      readonly spec: string;
      readonly created_sequence: number;
    };
  }>
>;
