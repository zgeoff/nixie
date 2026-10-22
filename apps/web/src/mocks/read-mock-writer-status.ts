import { store } from './store';

export function readMockWriterStatus() {
  const [writer] = store.memoryWriter.all();

  if (writer !== undefined) {
    return {
      isEnabled: writer.isEnabled,
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
    isEnabled: true,
    backlog: 0,
    batches: 0,
    cursor: Math.max(0, ...store.records.all().map((record) => record.sequence)),
    failures: 0,
    isCatchingUp: false,
    lastError: null,
    retryAt: null,
  };
}
