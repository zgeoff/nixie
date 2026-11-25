export interface FakeATCSession {
  readonly id: string;
  name: string;
  cwd: string;
  readonly daemon: string;
  readonly targetID: string;

  // atc's own state: running, needs_you, done or exited
  state: string;

  // lifecycle.harness: running, suspended or exited
  harness: string;
  readonly createdAt: number;
  prompt: string | null;
  pending: string | null;
  result: string | null;

  // false: the agent has no transcript reader
  hasTranscript: boolean;
  rows: { role: string; text: string; tools?: { name: string; summary: string }[] }[];
}

export interface FakeATCEvent {
  readonly session: string;
  readonly kind: string;
  readonly at: number;
  readonly detail: string | null;
  readonly message?: string;
  readonly label?: string;
  readonly text?: string;
  readonly complete?: boolean;
  readonly textError?: string;
}

export interface FakeATCCall {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

// A failure that the fake answers in place of a tool's next call.
export type FakeATCFailure =
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'http'; readonly status: number };

export interface FakeATCState {
  readonly sessions: Map<string, FakeATCSession>;
  readonly trail: FakeATCEvent[];
  readonly calls: FakeATCCall[];

  // each key's first answer, by tool and key
  readonly answersByKey: Map<string, Record<string, unknown>>;
  readonly failures: Map<string, FakeATCFailure[]>;
  readonly messages: Map<string, { session: string; text: string }>;
  nextID: number;
  now: () => number;
}
