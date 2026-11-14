import type { ModelPrices, ModelSecrets, ModelsConfig } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { RunSettings } from '@heynixie/tasks';
import { buildDollarsMeter } from './build-dollars-meter';
import { buildTurnsMeter } from './build-turns-meter';

export interface RunSettingsOptions {
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly hopLimit: number;
}

// The server builds the settings once, and the claim, the start and the end of a task run read
// them. A started task reports with wake, and a definition's task run with next_turn, because a
// scheduled task run with wake would spend a conversation turn on each fire.
export function buildRunSettings(options: RunSettingsOptions): RunSettings {
  const profiles = resolveModelCredentials(options.models, options.secrets);
  const fallback = resolveRoleProfile(options.models, 'task');

  const readPrices = (profile: string | null): ModelPrices | null =>
    (profile === null ? fallback : (profiles[profile]?.profile ?? fallback)).prices;

  return {
    reportDefaults: { start: 'wake', definition: 'next_turn' },
    meters: [buildTurnsMeter(), buildDollarsMeter(readPrices)],
    hopLimit: options.hopLimit,
  };
}
