import { store } from './store';

// Reads the memory writer's progress as nixie's API reports it. Without a stored status, the
// writer reads as caught up at the last record, with nothing waiting.
export function readMockWriterStatus() {
  const [writer] = store.memoryWriter.all();

  if (writer !== undefined) {
    return {
      backlog: writer.backlog,
      batches: writer.batches,
      cursor: writer.cursor,
      failures: writer.failures,
      isCatchingUp: writer.isCatchingUp,
      lastError: writer.lastError,
      retryAt: writer.retryAt,
    };
  }

  return {
    backlog: 0,
    batches: 0,
    cursor: Math.max(0, ...store.records.all().map((record) => record.sequence)),
    failures: 0,
    isCatchingUp: false,
    lastError: null,
    retryAt: null,
  };
}
