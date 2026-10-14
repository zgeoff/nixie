// An exec in an imp, as the adapter drives it.
export interface ImpExec {
  // resolves once impd started the command, after any wake the exec waited for
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

  // the guest kills the exec's cgroup this long after the first SIGTERM
  readonly killGraceMs: number;

  // with a grant, the command starts only once impd set the broker's variables for this boot
  readonly requireBroker: boolean;
}

export interface ImpPolicy {
  readonly mode: 'none' | 'public' | 'box';
  readonly allow: readonly string[];
}

export interface ImpCreateInput {
  readonly name: string;
  readonly image: string;
  readonly vcpus: number;
  readonly memoryMib: number;
  readonly diskMib: number;
  readonly policy: ImpPolicy;

  // false leaves the imp's disk out of every backup impd takes, for the imp's life
  readonly backup: boolean;
}

// One connection the guest opened on the forward's port, which the adapter relays.
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

  // impd honours a create's backup opt-out; an impd without it ignores the field
  readonly hasBackupOptOut: boolean;
}

interface ImpImage {
  readonly name: string;
  readonly digest: string;

  // the reference impd pulled the image from, such as ghcr.io/example/nixie-fetch@sha256:<hex>
  readonly ref: string;
}

// A custom secret the broker sends to one host, in one header with its scheme.
interface ImpSecretInput {
  readonly name: string;
  readonly value: string;
  readonly host: string;
  readonly header: string;
  readonly scheme: 'bearer' | 'raw';
}

// The impd calls the adapter makes. buildImpPort implements it on imp's client; a test stands in
// for impd with its own.
export interface ImpPort {
  readonly readFeatures: () => Promise<ImpFeatures>;
  readonly createImp: (input: ImpCreateInput) => Promise<void>;

  // whether impd backs the imp up, or null when no imp has the name
  readonly readImpBackup: (name: string) => Promise<boolean | null>;

  // an imp that is gone already counts as removed
  readonly removeImp: (name: string) => Promise<void>;
  readonly sleepImp: (name: string) => Promise<void>;
  readonly wakeImp: (name: string) => Promise<void>;

  // the hosts a secret's broker rules cover, or null when no secret has the name
  readonly readSecretHosts: (secret: string) => Promise<readonly string[] | null>;
  readonly addGrant: (name: string, secret: string) => Promise<void>;
  readonly addSecret: (secret: ImpSecretInput) => Promise<void>;

  // the images impd holds, by name. The digest is sha256:<hex> for a pulled image, and
  // imp-build-<hex> for one impd built from the reference.
  readonly listImages: () => Promise<readonly ImpImage[]>;

  // impd pulls the image by its reference and keeps it under the name
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
