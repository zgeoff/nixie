import { periodOf } from '@heynixie/periods';
import { loadProxyConfig } from '../proxy/load-proxy-config';
import type { DayOverride } from '../types';
import { readOverride } from './read-override';
import { withOverrideLock } from './with-override-lock';
import { writeOverride } from './write-override';

export interface RaiseOptions {
  readonly configPath: string;

  // a route or a provider, never both
  readonly target: { readonly kind: 'route' | 'provider'; readonly id: string };
  readonly dollars: number;
  readonly now: () => number;
}

// The host command: writes a route's or a provider's day limit for the day in force in the config's
// zone, keeps every other entry, and returns what it wrote. The limit may pass the cap, because only
// a host command writes it.
export async function runRaise(options: RaiseOptions): Promise<DayOverride> {
  const config = await loadProxyConfig(options.configPath);

  if (config.periods.override === null) {
    throw new Error(
      'the config names no override file, so the gateway reads no raise from the host',
    );
  }

  const kind = options.target.kind;
  const id = options.target.id;

  if (kind === 'provider' && !Object.hasOwn(config.providers, id)) {
    throw new Error(`the config names no provider ${id}`);
  }

  if (
    kind === 'route' &&
    (!Object.hasOwn(config.routes, id) || config.routes[id]?.limits === null)
  ) {
    throw new Error(`the config names no limits for the route ${id}`);
  }

  if (!Number.isFinite(options.dollars) || options.dollars <= 0) {
    throw new Error('the dollar limit is a positive number');
  }

  const override: DayOverride = {
    start: periodOf('day', options.now(), config.periods.zone).start,
    dollars: options.dollars,
  };

  const path = config.periods.override;

  // two raises of different routes each read the file, add their route and replace it, so the lock
  // spans the read and the write and neither loses the other's route
  await withOverrideLock(path, async () => {
    const earlier = await readOverride(path);

    const held = earlier.kind === 'found' ? earlier.overrides : { routes: {}, providers: {} };

    const written =
      kind === 'route'
        ? { ...held, routes: { ...held.routes, [id]: override } }
        : { ...held, providers: { ...held.providers, [id]: override } };

    await writeOverride(path, written);
  });

  return override;
}
