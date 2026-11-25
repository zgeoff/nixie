import { periodOf } from '@heynixie/periods';
import { loadProxyConfig } from '../proxy/load-proxy-config';
import type { DayOverride } from '../types';
import { readOverride } from './read-override';
import { writeOverride } from './write-override';

export interface RaiseOptions {
  readonly configPath: string;
  readonly route: string;
  readonly dollars: number;
  readonly now: () => number;
}

// The host command: writes the route's day limit for the day in force in the config's zone, keeps
// the other routes' overrides, and returns what it wrote. The limit may pass the cap, because only
// a host command writes it.
export async function runRaise(options: RaiseOptions): Promise<DayOverride> {
  const config = await loadProxyConfig(options.configPath);

  if (config.periods === null) {
    throw new Error('the config sets no periods, so there is no limit to raise');
  }

  if (config.periods.override === null) {
    throw new Error(
      'the config names no override file, so the gateway reads no raise from the host',
    );
  }

  if (
    !Object.hasOwn(config.routes, options.route) ||
    config.routes[options.route]?.limits === null
  ) {
    throw new Error(`the config names no limits for the route ${options.route}`);
  }

  if (!Number.isFinite(options.dollars) || options.dollars <= 0) {
    throw new Error('the dollar limit is a positive number');
  }

  const override: DayOverride = {
    start: periodOf('day', options.now(), config.periods.zone).start,
    dollars: options.dollars,
  };

  const earlier = await readOverride(config.periods.override);

  await writeOverride(config.periods.override, {
    ...(earlier.kind === 'found' ? earlier.overrides : {}),
    [options.route]: override,
  });

  return override;
}
