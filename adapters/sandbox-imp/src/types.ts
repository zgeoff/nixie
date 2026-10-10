// An exec in an imp, as the adapter drives it.
export interface ImpExec {
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
}

// The impd calls the adapter makes. buildImpPort implements it on imp's client; a test stands in
// for impd with its own.
export interface ImpPort {
  readonly readFeatures: () => Promise<ImpFeatures>;
  readonly createImp: (input: ImpCreateInput) => Promise<void>;

  // an imp that is gone already counts as removed
  readonly removeImp: (name: string) => Promise<void>;
  readonly sleepImp: (name: string) => Promise<void>;
  readonly wakeImp: (name: string) => Promise<void>;

  // the hosts a secret's broker rules cover, or null when no secret has the name
  readonly readSecretHosts: (secret: string) => Promise<readonly string[] | null>;
  readonly addGrant: (name: string, secret: string) => Promise<void>;
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
