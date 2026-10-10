// The kinds of work that run in a sandbox, each with its own egress, grants and tool route.
export type SandboxKind = 'conversation' | 'worker' | 'code_run' | 'fetch' | 'coding';

// What the sandbox reaches past its host, enforced at the network layer outside the guest. public
// reaches the global internet only, never the host, the runtime's API, other sandboxes, or a
// private, link-local, tailnet or deployment-listed range.
export type Egress =
  | { readonly kind: 'none' }
  | { readonly kind: 'public' }
  | { readonly kind: 'allow'; readonly hosts: readonly string[] };

// A credential the adapter's injecting backend adds to requests for one host. It dials from the
// host, so a grant never becomes a network exception in the guest. env holds the placeholders the
// guest sees in place of the credential, such as ANTHROPIC_API_KEY.
export interface GrantSpec {
  readonly secret: string;
  readonly host: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface SandboxLimits {
  readonly vcpus: number;
  readonly memoryMiB: number;
  readonly diskMiB: number;
}

export interface SandboxSpec {
  readonly kind: SandboxKind;

  // a purpose-built image per kind of work
  readonly image: string;

  // the task step or tool call the sandbox belongs to, which crash recovery reads
  readonly owner: string;
  readonly egress: Egress;

  // empty for code runs, the profile's model credential for model loops
  readonly grants: readonly GrantSpec[];

  // open the route back to nixie's tools
  readonly toolRoute: boolean;
  readonly limits: SandboxLimits;
}

export interface SandboxAdapter {
  // such as 'imp', which each sandbox's records name so recovery returns to the same adapter
  readonly id: string;
  readonly boundary: 'microvm' | 'container' | 'process';
  readonly create: (spec: SandboxSpec) => Promise<Sandbox>;
  readonly get: (id: string) => Promise<Sandbox | null>;

  // every sandbox this adapter made for the owner that is not yet destroyed, for crash recovery
  readonly list: (owner: string) => Promise<readonly Sandbox[]>;
}

export interface ExecSpec {
  readonly argv: readonly string[];

  // passed by name, over the adapter's own variables: the broker's, NO_PROXY and each grant's
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

export interface RunSpec extends ExecSpec {
  readonly stdin?: Uint8Array;
}

export interface SpawnSpec extends ExecSpec {
  // the largest message the caller takes; a longer frame ends the stream
  readonly maxMessageBytes: number;
}

// One output stream of a command, cut at the adapter's limit. totalBytes counts every byte the
// command wrote, so a cut shows how much it dropped.
export interface CollectedOutput {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly totalBytes: number;
  readonly isCut: boolean;
}

export interface ExecExit {
  // null when a signal ended the command
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

// A long-lived process with stdin and stdout open, such as the SDK of a worker or the conversation.
// Both directions carry framed messages.
export interface ExecStream {
  readonly messages: AsyncIterable<Uint8Array<ArrayBuffer>>;
  readonly send: (message: Uint8Array) => Promise<void>;
  readonly exit: Promise<StreamExit>;

  // sends SIGTERM, and the adapter kills the process's cgroup 5 s later if anything is left
  readonly stop: () => Promise<StreamExit>;
}

export interface FileSpec {
  // an absolute path in the guest
  readonly path: string;
  readonly content: Uint8Array<ArrayBuffer>;
}

// Where the guest reaches nixie's tools: a base URL on the guest's loopback, with 127.0.0.1 on
// NO_PROXY so requests skip the broker.
export interface ToolRoute {
  readonly url: string;
}

// Where the route delivers each connection the guest opens: the tool endpoint for the sandbox's run.
export type ToolTarget =
  | { readonly path: string }
  | { readonly host: string; readonly port: number };

export interface SandboxRef {
  readonly id: string;
  readonly owner: string;
}

// Picks the tool target for a sandbox, from its ID and its owner's run.
export type ToolTargetResolver = (sandbox: SandboxRef) => ToolTarget;

export type Suspension =
  | {
      readonly kind: 'memory';
      readonly sleep: () => Promise<void>;
      readonly wake: () => Promise<void>;
    }
  | { readonly kind: 'none' };

export interface Sandbox {
  readonly id: string;
  readonly spec: SandboxSpec;
  readonly exec: (command: RunSpec, signal?: AbortSignal) => Promise<ExecResult>;
  readonly spawn: (command: SpawnSpec) => Promise<ExecStream>;
  readonly copyIn: (files: readonly FileSpec[]) => Promise<void>;
  readonly copyOut: (paths: readonly string[]) => Promise<readonly FileSpec[]>;
  readonly toolRoute: () => Promise<ToolRoute | null>;
  readonly suspension: Suspension;
  readonly destroy: () => Promise<void>;
}

// One lifecycle event of a sandbox, which the recorder writes as a record of kind sandbox.<event>.
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

// A sandbox the records show as made and not yet destroyed.
export interface SandboxRow {
  readonly sandboxID: string;
  readonly adapter: string;
  readonly owner: string;
  readonly state: 'awake' | 'sleeping';
  readonly spec: SandboxSpec;
}

// How an adapter writes its sandboxes' records and reads them back.
export interface SandboxRecorder {
  readonly write: (event: SandboxEvent) => Promise<void>;
  readonly findRow: (adapter: string, sandboxID: string) => Promise<SandboxRow | null>;
  readonly list: (adapter: string, owner: string) => Promise<readonly SandboxRow[]>;
}

// The projection's rows, as SQLite returns them.
export type SandboxTables = Readonly<{
  sandboxes: {
    readonly sandbox_id: string;
    readonly adapter: string;
    readonly owner: string;
    readonly kind: string;
    readonly state: 'awake' | 'sleeping';
    readonly spec: string;
    readonly created_sequence: number;
  };
}>;
