import { toErrorFields } from '@heynixie/logger';
import { runDefinitionsSeed } from './run-definitions-seed';
import { startDefinitionsPoll } from './start-definitions-poll';
import type { ServerParts } from './types';

interface SeedPollOptions {
  // the seed at start was refused, so the poll retries it within seconds
  readonly isRefusedAtStart: boolean;
}

// Probes the definitions source on the configured interval, 5 min by default, and from 1 s after a
// failure. Each probe logs definitions.probed, and only a seed logs definitions.seeded, so the log
// shows the poll alive while the definitions stay the same.
export async function startSeedPoll(parts: ServerParts, options: SeedPollOptions): Promise<void> {
  const poll = startDefinitionsPoll({
    probe: parts.source.probe,
    seed: async () => {
      const seeded = await runDefinitionsSeed(parts);

      return seeded.status !== 'refused';
    },

    // a skill reload seeds over the same parts, and its refusal leaves the definitions unready
    isRefused: () => !parts.state.read().definitions.isReady,
    clock: parts.context.clock,
    intervalMs: parts.config.definitions.probeIntervalMs,
    retryDelayMs: 1000,
    isRefusedAtStart: options.isRefusedAtStart,
    onProbed: (probed) => {
      parts.log('definitions.probed', { isChanged: probed.isChanged });
    },
    onError: (error) => {
      parts.log('definitions.probe_failed', toErrorFields(error));
    },
  });

  await parts.cleanup.defer(poll.stop);
}
