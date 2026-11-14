import type { GrantSpec, SecretSpec } from '@heynixie/sandbox';
import type { HarnessID, ModelAPI, SessionPoint, TurnProfile } from '@heynixie/wire';
import type { ModelProfile } from './types';

export type HarnessEntry = 'turn' | 'check';

export interface HarnessGuest {
  // the guest's folder under guests/
  readonly package: string;

  // the file under the guest's src/ that runs each entry, or null for an entry the guest lacks
  readonly entries: { readonly turn: string; readonly check: string | null };
}

export interface HarnessDescriptor {
  readonly id: HarnessID;
  readonly api: ModelAPI;
  readonly buildGrant: (secret: SecretSpec) => GrantSpec;
  readonly toTurnProfile: (profile: ModelProfile) => TurnProfile;
  readonly guest: HarnessGuest;

  // the key of the guest's image in the sandbox manifest
  readonly imageKey: string;

  // the MCP _meta key under which the guest sends the model's tool-use ID on each tool call
  readonly toolUseMetaKey: string | null;

  // how long the harness's runtime waits for one tool call, in milliseconds: 900,000 on a harness
  // whose probe passed, null on any other harness
  readonly toolCallWaitMs: number | null;

  // the paths, relative to the folder that holds a session, that a replaced sandbox carries; null
  // when the harness keeps no session a new sandbox can resume
  readonly listSessionFiles: ((point: SessionPoint) => readonly string[]) | null;
}
