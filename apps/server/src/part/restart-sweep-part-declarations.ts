import { readTasksWithPendingActions } from '@heynixie/actions';
import { removeRestoreMarker } from '@heynixie/log';
import { installRestorePause } from '@heynixie/tasks';
import { startConversationImp } from '../conversation/start-conversation-imp';
import { runDefinitionsSeed } from '../definition/run-definitions-seed';
import { registerSandboxImages } from '../sandbox/register-sandbox-images';
import type { AnyPartDeclaration, PartReader, ServerParts } from '../types';
import { makeRetriedStart } from './make-retried-start';
import { runRestartSweepSteps } from './run-restart-sweep-steps';
import type { ServerPartValues } from './server-part-values';

export const restartSweepPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'first_seed',
    needs: ['server_parts'],
    start: makeRetriedStart('first_seed', requireFirstSeed),
  },
  {
    name: 'restore_pause',
    needs: ['inputs', 'server_parts', 'first_seed'],
    start: makeRetriedStart('restore_pause', installPauseAndClearMarker),
  },
  {
    name: 'restart_sweep',
    needs: ['inputs', 'server_parts', 'first_seed', 'restore_pause'],
    start: makeRetriedStart('restart_sweep', async (parts, reader) => {
      await runRestartSweepSteps(parts);

      if (NIXIE_TEST_BUILD) {
        await reader.get('inputs').options.harness?.link.waitAtFaultPoint('test.swept', {
          kind: 'restart_sweep',
          id: null,
        });
      }
    }),
  },
  {
    name: 'add_images',
    needs: ['server_parts', 'restart_sweep'],
    start: makeRetriedStart('add_images', registerSandboxImages),
  },
  {
    name: 'conversation_imp',
    needs: ['server_parts', 'add_images'],
    uses: ['memory', 'connections'],
    start: makeRetriedStart('conversation_imp', (parts, reader) =>
      startConversationImp(
        parts,
        () => reader.get('memory'),
        () => reader.find('connections') ?? null,
      ),
    ),
  },
];

async function requireFirstSeed(parts: ServerParts): Promise<void> {
  if (parts.inForce.read() !== null) {
    return;
  }

  const seeded = await runDefinitionsSeed(parts);

  if (seeded.status === 'refused') {
    throw seeded.error;
  }
}

async function installPauseAndClearMarker(
  parts: ServerParts,
  reader: PartReader<ServerPartValues>,
): Promise<void> {
  const writer = reader.get('inputs').options.writer;

  const installed = await installRestorePause(parts.context, {
    pending: writer.pendingRestore,
    readTasksWithPendingActions,
  });

  if (installed === null) {
    return;
  }

  parts.log('restore.paused', {
    recoveryID: installed.recoveryID,
    toCheck: installed.toCheck,
    isNew: installed.isNew,
  });

  if (NIXIE_TEST_BUILD) {
    await reader.get('inputs').options.harness?.link.waitAtFaultPoint('recovery.pause.committed', {
      kind: 'recovery',
      id: null,
    });
  }

  await removeRestoreMarker(writer.dataDir);

  if (NIXIE_TEST_BUILD) {
    await reader
      .get('inputs')
      .options.harness?.link.waitAtFaultPoint('recovery.pause.marker_cleared', {
        kind: 'recovery',
        id: null,
      });
  }
}
