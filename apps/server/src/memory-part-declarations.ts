import { runPendingRecordForgets } from '@heynixie/api';
import { makeRetriedStart } from './make-retried-start';
import type { ServerPartValues } from './server-part-values';
import { startConsolidatorTask } from './start-consolidator-task';
import { startMemory } from './start-memory';
import { startWriterTask } from './start-writer-task';
import type { AnyPartDeclaration } from './types';

// The memory store, which takes the conversation's session cleanup, then the cleanup the API's
// record forget reads, each pending record forget, the memory writer and the memory consolidator,
// so no turn runs before the store is there or on a session that holds a forgotten record's text.
export const memoryPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'memory',
    needs: ['server_parts', 'conversation_imp'],
    start: makeRetriedStart('memory', (parts, reader) =>
      startMemory(parts, reader.get('conversation_imp').cleanupSessions),
    ),
  },
  {
    // the cleanup is ready once the store is, so a forget that read it before is pending; a
    // forgotten message leaves the message indexes before its session cleanup runs
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
