import { writeBackupFloor } from '@heynixie/backup';
import type { CodeSandboxLister } from '@heynixie/connectors';
import { makeCodeRunCleanup } from '@heynixie/connectors';
import type { ErasureRunnerControl } from '@heynixie/log';
import { localDataStorage, makeErasureRunner } from '@heynixie/log';
import { readCleanedTaskIDs } from '@heynixie/sessions';
import { waitAtFaultPoint } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { ServerPartValues } from '../part/server-part-values';
import type { PartReader, ServerParts } from '../types';

// What the runner takes of the server's parts and of the started parts, so a test supplies each
// one for real.
export type ErasureRunnerParts = Pick<ServerParts, 'context' | 'turnInputs'> & {
  readonly tools: { readonly adapter: CodeSandboxLister };
  readonly config: { readonly backup: Pick<ServerParts['config']['backup'], 'isEnabled'> };
};

export interface ErasureRunnerValues {
  readonly conversation_imp: Pick<ServerPartValues['conversation_imp'], 'cleanupSessions'>;
  readonly sandbox_runner: Pick<ServerPartValues['sandbox_runner'], 'cleanupSessions'>;
  readonly memory: Pick<ServerPartValues['memory'], 'finishEvidencePurges'>;
}

// The runner takes every forget through the same steps. Only the server reaches the sessions, the
// turn inputs and the sandboxes at once, so it supplies each as an effect, and the notebook and the
// memory store register their erasables with the runner it returns.
export function startErasureRunner(
  parts: ErasureRunnerParts,
  reader: PartReader<ErasureRunnerValues>,
): ErasureRunnerControl {
  const conversation = reader.get('conversation_imp');
  const tasks = reader.get('sandbox_runner');

  return makeErasureRunner({
    log: parts.context.log,
    definitions: parts.context.definitions,
    effects: {
      closeCaptures: () => parts.turnInputs.closeCaptures({ cause: 'forget' }),
      holdCaptures: (erasureID) => {
        parts.turnInputs.holdCaptures(erasureID);
      },
      releaseCaptures: (erasureID) => {
        parts.turnInputs.releaseCaptures(erasureID);
      },
      destroySandboxes: async (callIDs) => {
        // Built from the adapter, so an erasure destroys the code sandboxes that remain while the code
        // tool is off.
        await makeCodeRunCleanup(parts.context.log, parts.tools.adapter).destroyForRecords(
          callIDs.map(Number),
        );
      },
      cleanupSessions: async (cause) => {
        await conversation.cleanupSessions(cause);
        await tasks.cleanupSessions(cause);
      },
      readCleanedThreads: (cause) => readCleanedTaskIDs(parts.context, cause),
      finishPurges: async (recordSequence) => {
        const memory = reader.find('memory');

        invariant(memory, 'the memory store is started when an erasure holds a purge');

        await memory.finishEvidencePurges({ recordSequence });
      },
      removeTurnInputs: (scope) => parts.turnInputs.removeForgotten(scope),
      writeBackupFloor: (tx) =>
        parts.config.backup.isEnabled
          ? writeBackupFloor({ storage: localDataStorage, writer: parts.context.log.writer }, tx)
          : Promise.resolve(),
      reachFaultPoint: (point, erasureID) =>
        NIXIE_TEST_BUILD
          ? waitAtFaultPoint(point, { kind: 'erasure', id: erasureID })
          : Promise.resolve(),
    },
  });
}
