import { runPendingRecordForgets } from '@heynixie/api';
import { startMemory } from '../cli/start-memory';
import { runTurnInputForget } from '../turn/run-turn-input-forget';
import type { AnyPartDeclaration } from '../types';
import { makeRetriedStart } from './make-retried-start';
import type { ServerPartValues } from './server-part-values';
import { startChecker } from './start-checker';
import { startNotebookPart } from './start-notebook-part';

export const memoryPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'checker',
    needs: ['server_parts', 'conversation_imp'],
    start: makeRetriedStart('checker', (parts) => startChecker(parts)),
  },
  {
    name: 'memory',
    needs: ['server_parts', 'conversation_imp', 'sandbox_runner', 'checker'],
    start: makeRetriedStart('memory', (parts, reader) => {
      const conversation = reader.get('conversation_imp');
      const tasks = reader.get('sandbox_runner');

      return startMemory(
        parts,
        async (cause) => {
          await conversation.cleanupSessions(cause);
          await tasks.cleanupSessions(cause);

          await runTurnInputForget(parts, cause);
        },
        reader.get('checker').check,
      );
    }),
  },
  {
    name: 'notebook',
    needs: ['server_parts', 'conversation_imp', 'sandbox_runner', 'memory'],
    start: makeRetriedStart('notebook', (parts, reader) => {
      const conversation = reader.get('conversation_imp');
      const tasks = reader.get('sandbox_runner');

      return startNotebookPart(parts, reader.get('memory'), async (cause) => {
        await conversation.cleanupSessions(cause);
        await tasks.cleanupSessions(cause);

        await runTurnInputForget(parts, cause);
      });
    }),
  },
  {
    name: 'session_cleanup',
    needs: ['server_parts', 'conversation_imp', 'sandbox_runner', 'memory'],
    start: (reader) => {
      const parts = reader.get('server_parts');
      const conversation = reader.get('conversation_imp');
      const tasks = reader.get('sandbox_runner');
      const memory = reader.get('memory');

      return Promise.resolve(async (cause) => {
        await conversation.cleanupSessions(cause);
        await tasks.cleanupSessions(cause);

        await runTurnInputForget(parts, cause);

        // The sessions rebuild first, so no turn still holds a value that a purge deletes.
        await memory.finishEvidencePurges({ recordSequence: cause.recordSequence });
      });
    },
  },
  {
    name: 'record_forgets',
    needs: ['server_parts', 'session_cleanup'],
    start: makeRetriedStart('record_forgets', (parts) => runPendingRecordForgets(parts.apiContext)),
  },
];
