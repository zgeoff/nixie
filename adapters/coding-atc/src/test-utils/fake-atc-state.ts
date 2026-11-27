type FakeATCSessionState = 'running' | 'needs_you' | 'done' | 'exited';

export interface FakeATCSession {
  readonly id: string;
  name: string;
  cwd: string;
  readonly daemon: string;
  readonly targetID: string;

  // atc's own state
  state: FakeATCSessionState;

  // lifecycle.harness
  harness: 'running' | 'suspended' | 'exited';
  readonly createdAt: number;
  prompt: string | null;
  pending: string | null;
  result: string | null;

  // false: the agent has no transcript reader
  hasTranscript: boolean;
  rows: { role: 'user' | 'assistant'; text: string; tools?: { name: string; input: string }[] }[];
}

export interface FakeATCEvent {
  readonly session: string;
  readonly kind: string;
  readonly at: number;
  readonly detail: string | null;
  readonly message?: string;
  readonly label?: string;

  // the whole text of a note or an answer, which atc keeps apart from the trail's preview
  readonly text?: string;

  // false: atc cut the text it keeps
  readonly complete?: boolean;

  // set: atc cannot read the text it keeps
  readonly textError?: string;
}

export interface FakeATCCall {
  // the fleet procedure, such as `session.spawn`
  readonly procedure: string;
  readonly args: Readonly<Record<string, unknown>>;
}

// A failure that the fake answers in place of a procedure's next call. A `lost` call runs, and its
// answer never arrives: the caller sees `outcome_unknown`.
export type FakeATCFailure =
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'lost' }
  | { readonly kind: 'http'; readonly status: number };

export interface FakeATCState {
  readonly sessions: Map<string, FakeATCSession>;
  readonly trail: FakeATCEvent[];
  readonly calls: FakeATCCall[];

  // the session that each spawn key started, and the message that each message key sent
  readonly spawnKeys: Map<string, string>;
  readonly messageKeys: Map<string, string>;
  readonly failures: Map<string, FakeATCFailure[]>;
  readonly messages: Map<string, { session: string; text: string }>;

  // how the gateway reports the daemon `cloud`
  daemonState: 'up' | 'down' | 'mismatched' | 'refused' | 'unauthorized' | 'changed';

  // the major version of the contract the fake serves
  readonly major: number;
  nextID: number;
  now: () => number;
}
