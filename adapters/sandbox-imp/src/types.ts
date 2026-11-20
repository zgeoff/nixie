export interface ImpExec {
  readonly started: Promise<unknown>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly write: (data: Uint8Array) => Promise<void>;
  readonly closeStdin: () => Promise<void>;
  readonly sendSignal: (signal: string) => void;
  readonly close: () => void;
  readonly exit: Promise<{ readonly code: number | null; readonly signal: string | null }>;
}

export interface ImpExecOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly cwd?: string;

  readonly killGraceMs: number;

  readonly requireBroker: boolean;
}

export interface ImpPolicy {
  readonly mode: 'none' | 'public' | 'box';
  readonly allow: readonly string[];
}

interface ImpCreateInput {
  readonly name: string;
  readonly image: string;
  readonly vcpus: number;
  readonly memoryMib: number;
  readonly diskMib: number;
  readonly policy: ImpPolicy;

  readonly backup: boolean;
}

export interface ImpRelayHandlers {
  readonly onData: (data: Uint8Array) => Promise<void> | void;
  readonly onEof: () => void;
  readonly onClose: (lost: boolean) => void;
}

export interface ImpRelay {
  readonly send: (data: Uint8Array) => boolean;
  readonly waitForRoom: () => Promise<void>;
  readonly sendEof: () => void;
  readonly close: () => void;
}

export interface ImpForward {
  readonly listening: Promise<unknown>;
  readonly ended: Promise<{ readonly kind: string }>;
  readonly stop: () => void;
}

export interface ImpFeatures {
  readonly publicEgress: boolean;
  readonly isEgressEnforced: boolean;

  readonly hasBackupOptOut: boolean;
}

interface ImpImage {
  readonly name: string;
  readonly digest: string;

  readonly ref: string;
}

interface ImpSecretInput {
  readonly name: string;
  readonly value: string;
  readonly host: string;
  readonly header: string;
  readonly scheme: 'bearer' | 'raw';

  // the origin that the broker sends the host's requests to, in place of the host; a test impd that
  // cannot reach the model host by name sets it, and no product caller does
  readonly upstream?: string;
}

// The gateway that counts every model request: a model secret must send to its model URL, and each
// grant covers only the path of its own sandbox.
export interface ModelGateway {
  readonly modelURL: string;
}

interface GrantFilter {
  readonly paths: readonly string[];
}

export interface GrantRow {
  readonly secret: string;

  // the paths the grant is limited to, or null for a grant with no path filter
  readonly paths: readonly string[] | null;
}

export interface ImpPort {
  readonly readFeatures: (signal?: AbortSignal) => Promise<ImpFeatures>;
  readonly createImp: (input: ImpCreateInput) => Promise<void>;

  readonly readImpBackup: (name: string) => Promise<boolean | null>;

  readonly removeImp: (name: string) => Promise<void>;
  readonly sleepImp: (name: string) => Promise<void>;
  readonly wakeImp: (name: string) => Promise<void>;

  readonly readSecretHosts: (secret: string) => Promise<readonly string[] | null>;

  // the origin that each rule of the secret sends to, in place of its host, or null for a rule with
  // none; null for a secret that impd lacks
  readonly readSecretUpstreams: (secret: string) => Promise<readonly (string | null)[] | null>;
  readonly readGrants: (name: string) => Promise<readonly GrantRow[]>;
  readonly addGrant: (name: string, secret: string, filter?: GrantFilter) => Promise<void>;
  readonly addSecret: (secret: ImpSecretInput) => Promise<void>;
  readonly removeSecret: (name: string) => Promise<void>;

  readonly listImages: () => Promise<readonly ImpImage[]>;

  readonly addImage: (image: ImpImage) => Promise<void>;
  readonly openExec: (
    name: string,
    argv: readonly string[],
    options: ImpExecOptions,
  ) => Promise<ImpExec>;
  readonly openReverseForward: (
    name: string,
    guestPort: number,
    onConnection: (accept: (handlers: ImpRelayHandlers) => ImpRelay) => void,
  ) => ImpForward;
}
