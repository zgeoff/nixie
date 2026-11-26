import { toMicrosUp } from '@heynixie/budgets';
import type { Logger } from '@heynixie/logger';
import type { ModelCredentials, ModelPrices, ModelsConfig } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { SpendGateway } from '@heynixie/spend';
import type { RunSettings, SandboxMicrosRead } from '@heynixie/tasks';
import { buildDollarsMeter } from './build-dollars-meter';
import { buildTurnsMeter } from './build-turns-meter';

export interface RunSettingsOptions {
  readonly models: ModelsConfig;
  readonly credentials: ModelCredentials;
  readonly hopLimit: number;

  // the gateway that counts every model request, which makes it the meter of a new task run; absent
  // when the deployment has none
  readonly gateway?: Pick<SpendGateway, 'readSandbox'>;

  readonly logger: Logger;
}

// The server builds the settings once, and the claim, the start and the end of a task run read
// them. A started task reports with wake, and a definition's task run with next_turn, because a
// scheduled task run with wake would spend a conversation turn on each fire.
export function buildRunSettings(options: RunSettingsOptions): RunSettings {
  const profiles = resolveModelCredentials(options.models, options.credentials.resolveCredential);
  const fallback = resolveRoleProfile(options.models, 'task');

  const readPrices = (profile: string | null): ModelPrices | null =>
    (profile === null ? fallback : (profiles[profile]?.profile ?? fallback)).prices;

  return {
    reportDefaults: { start: 'wake', definition: 'next_turn' },
    meter: options.gateway === undefined ? 'records' : 'gateway',
    meters: [buildTurnsMeter(), buildDollarsMeter(readPrices)],
    readSandboxMicros: (sandbox) => readSandboxMicros(options, sandbox),
    hopLimit: options.hopLimit,
  };
}

// The count that a task run's end reads of a sandbox, rounded up to the micro.
async function readSandboxMicros(
  options: RunSettingsOptions,
  sandbox: string,
): Promise<SandboxMicrosRead> {
  if (options.gateway === undefined) {
    return { kind: 'gone' };
  }

  const read = await options.gateway.readSandbox(sandbox);

  if (read.kind === 'ok') {
    return { kind: 'ok', micros: toMicrosUp(read.value.dollars) };
  }

  if (read.kind === 'not_found') {
    return { kind: 'gone' };
  }

  options.logger(
    'task.meter_read_failed',
    { sandboxID: sandbox, reason: 'run_end', outcome: read.kind },
    'warn',
  );

  return { kind: 'unreachable' };
}
