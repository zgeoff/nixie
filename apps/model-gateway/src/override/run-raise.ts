import { periodOf } from '@heynixie/periods';
import { loadProxyConfig } from '../proxy/load-proxy-config';
import type { Override, PeriodName } from '../types';
import { overrideSchema } from './override-schema';
import { writeOverride } from './write-override';

export interface RaiseOptions {
  readonly configPath: string;
  readonly period: PeriodName;
  readonly dollars: number;
  readonly tokens: number;
  readonly now: () => number;
}

// The host command: writes the override for the period in force in the config's zone, and returns
// what it wrote. The override may pass the cap, because only a host command writes it.
export async function runRaise(options: RaiseOptions): Promise<Override> {
  const config = await loadProxyConfig(options.configPath);

  if (config.periods === null) {
    throw new Error('the config sets no periods, so there is no limit to raise');
  }

  if (config.periods.override === null) {
    throw new Error(
      'the config names no override file, so the gateway reads no raise from the host',
    );
  }

  const override: Override = overrideSchema.parse({
    period: options.period,
    start: periodOf(options.period, options.now(), config.periods.zone).start,
    limit: { dollars: options.dollars, tokens: options.tokens },
  });

  await writeOverride(config.periods.override, override);

  return override;
}
