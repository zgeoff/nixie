import type { GrantSpec, SandboxImageKey, SecretSpec } from '@heynixie/sandbox';
import type {
  HarnessCapability,
  HarnessID,
  HasSession,
  ModelAPI,
  SessionPoint,
  TurnProfile,
} from '@heynixie/wire';
import type { HarnessProfileSchema } from './build-models-config-schema';
import type { ModelProfile } from './types';

export type HarnessEntry = 'turn' | 'check';

export interface HarnessGuest {
  // the guest's folder under guests/
  readonly package: string;

  // the file under the guest's src/ that runs each entry, or null for an entry the guest lacks
  readonly entries: { readonly turn: string; readonly check: string | null };
}

export interface HarnessSession {
  // whether a stored point is this harness's
  readonly owns: (point: SessionPoint) => boolean;

  // for lostSessionID and the kept session
  readonly nameSession: (point: SessionPoint) => string;

  // the paths, relative to the folder that holds a session, that a replaced sandbox carries
  readonly listFiles: (point: SessionPoint) => readonly string[];
}

// One record per profile. Host code reads it and never branches on a harness ID.
export interface Harness {
  readonly id: HarnessID;
  readonly api: ModelAPI;
  readonly buildGrant: (secret: SecretSpec) => GrantSpec;
  readonly guest: HarnessGuest;

  // the key of the guest's image in the sandbox manifest
  readonly imageKey: SandboxImageKey;

  // the MCP _meta key under which the guest sends the model's tool-use ID on each tool call
  readonly toolUseMetaKey: string | null;

  // how long the harness's runtime waits for one tool call, in milliseconds: 900,000 on a harness
  // whose probe passed, null on any other harness
  readonly toolCallWaitMs: number | null;

  readonly capabilities: ReadonlySet<HarnessCapability>;

  // the HTTP header that carries the model secret
  readonly secretHeader: SecretSpec['header'];

  // 'kept': a session nixie resumes. 'one-off': a session nixie never resumes, such as a check's.
  readonly toTurnProfile: (use: 'kept' | 'one-off') => TurnProfile;

  // in tokens; null without the context-window capability
  readonly contextWindow: number | null;

  // non-null exactly for a harness with a session; the definition's type enforces it
  readonly session: HarnessSession | null;
}

export interface HarnessDefinition<ID extends HarnessID, Profile extends ModelProfile> {
  readonly id: ID;
  readonly profileSchema: HarnessProfileSchema;
  readonly bind: (profile: Profile) => Omit<Harness, 'session'>;
  readonly session: HasSession<ID> extends true ? HarnessSession : null;
}
