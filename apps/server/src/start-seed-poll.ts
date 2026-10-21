import { probeWrittenSkillsPending } from '@heynixie/definitions';
import { toErrorFields } from '@heynixie/logger';
import { runDefinitionsSeed } from './run-definitions-seed';
import type { SeedParts } from './run-queued-seed';
import { startDefinitionsPoll } from './start-definitions-poll';
import type { Cleanup, ServerParts } from './types';

export type SeedPollParts = SeedParts & {
  readonly config: {
    readonly definitions: Pick<ServerParts['config']['definitions'], 'probeIntervalMs'>;
  };
  readonly cleanup: Pick<Cleanup, 'defer'>;
};

interface SeedPollOptions {
  readonly isRefusedAtStart: boolean;
}

export async function startSeedPoll(parts: SeedPollParts, options: SeedPollOptions): Promise<void> {
  const poll = startDefinitionsPoll({
    probe: parts.source.probe,
    seed: async () => {
      const seeded = await runDefinitionsSeed(parts);

      return seeded.status !== 'refused';
    },

    isRefused: () => !parts.state.read().definitions.isReady,

    probeSeedDue: () => probeWrittenSkillsPending(parts.context.log.writer.db),
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
