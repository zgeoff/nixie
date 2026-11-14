import type { ModelRole } from '@heynixie/models';
import type { HarnessID } from '@heynixie/wire';
import type { TurnInputLogConfig } from '../turn-input-log-config-schema';
import { pickCaptureSource } from './pick-capture-source';

export type CapturePlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'miss' }
  | { readonly kind: 'capture'; readonly name: string; readonly directory: string };

export interface CapturePlanInput {
  readonly config: TurnInputLogConfig | null;
  readonly isOn: boolean;
  readonly role: ModelRole;
  readonly profile: { readonly harness: HarnessID; readonly baseURL: string };
  readonly answers: ReadonlyMap<string, boolean>;
}

// A Codex step has no capture until the Codex CLI is known to keep the tag segment.
export function pickCapturePlan(input: CapturePlanInput): CapturePlan {
  const config = input.config;

  if (config === null || !input.isOn || !config.roles.some((role) => role === input.role)) {
    return { kind: 'none' };
  }

  const picked = pickCaptureSource(config.sources, input.profile.baseURL);

  if (
    picked === null ||
    input.profile.harness === 'codex' ||
    input.answers.get(picked.name) !== true
  ) {
    return { kind: 'miss' };
  }

  return { kind: 'capture', name: picked.name, directory: picked.source.directory };
}
