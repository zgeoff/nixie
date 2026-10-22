import { runPendingRecordForgets } from '@heynixie/api';
import { makeRetriedStart } from './make-retried-start';
import type { ServerPartValues } from './server-part-values';
import { startChecker } from './start-checker';
import { startConsolidatorTask } from './start-consolidator-task';
import { startMemory } from './start-memory';
import { startWriterTask } from './start-writer-task';
import type { AnyPartDeclaration } from './types';

export const memoryPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'checker',
    needs: ['server_parts', 'conversation_imp'],
    start: makeRetriedStart('checker', (parts) => startChecker(parts)),
  },
  {
    name: 'memory',
    needs: ['server_parts', 'conversation_imp', 'checker'],
    start: makeRetriedStart('memory', (parts, reader) =>
      startMemory(
        parts,
        reader.get('conversation_imp').cleanupSessions,
        reader.get('checker').check,
      ),
    ),
  },
  {
    name: 'session_cleanup',
    needs: ['conversation_imp', 'memory'],
    start: (reader) => {
      const store = reader.get('memory');
      const conversation = reader.get('conversation_imp');

      return Promise.resolve(async (cause) => {
        await store.removeMessages([cause.recordSequence]);
        await conversation.cleanupSessions(cause);
      });
    },
  },
  {
    name: 'record_forgets',
    needs: ['server_parts', 'session_cleanup'],
    start: makeRetriedStart('record_forgets', (parts) => runPendingRecordForgets(parts.apiContext)),
  },
  {
    name: 'memory_writer',
    needs: ['server_parts', 'memory', 'record_forgets'],
    start: makeRetriedStart('memory_writer', (parts, reader) =>
      startWriterTask(parts, reader.get('memory')),
    ),
  },
  {
    name: 'memory_consolidator',
    needs: ['server_parts', 'memory', 'record_forgets'],
    start: makeRetriedStart('memory_consolidator', (parts, reader) =>
      startConsolidatorTask(parts, reader.get('memory')),
    ),
  },
];
