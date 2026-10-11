import { toErrorFields } from '@heynixie/ops';
import { runDefinitionsSeed } from './run-definitions-seed';
import { startDefinitionsPoll } from './start-definitions-poll';
import type { ServerParts } from './types';

// Probes the definitions source on the configured interval, 5 min by default, and seeds again on a
// new revision.
export async function startSeedPoll(parts: ServerParts): Promise<void> {
  const poll = startDefinitionsPoll({
    probe: parts.source.probe,
    seed: async () => {
      await runDefinitionsSeed(parts);
    },
    intervalMs: parts.config.definitions.probeIntervalMs,
    onError: (error) => {
      parts.log('definitions.probe_failed', toErrorFields(error));
    },
  });

  await parts.cleanup.defer(poll.stop);
}
