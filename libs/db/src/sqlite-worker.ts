// The worker that owns nixie's one bun:sqlite connection, so a slow query or a synchronous fsync
// never blocks the main thread's event loop.
import type { SQLQueryBindings } from 'bun:sqlite';
import { Database } from 'bun:sqlite';
import type { WorkerError, WorkerQueryResult, WorkerRequest, WorkerResponse } from './types';

// a worker's global scope sends and receives messages the way a Worker handle does
declare const self: Worker;

const state: { database: Database | null } = { database: null };

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker takes no origin
  self.postMessage(buildResponse(event.data));
});

function buildResponse(request: WorkerRequest): WorkerResponse {
  try {
    return { id: request.id, ok: true, result: runRequest(request) };
  } catch (error) {
    return { id: request.id, ok: false, error: toWorkerError(error) };
  }
}

function runRequest(request: WorkerRequest): WorkerQueryResult {
  if (request.kind === 'open') {
    state.database = startConnection(request.path);
    return { rows: [] };
  }
  if (request.kind === 'close') {
    state.database?.close();
    state.database = null;
    return { rows: [] };
  }
  if (state.database === null) {
    throw new Error('the database is not open');
  }
  return runQuery(state.database, request.sql, request.parameters);
}

// busy_timeout comes first, so even the switch to WAL waits for another connection's lock. WAL lets
// readers run beside the writer, and FULL fsyncs every commit so a claimed outside action survives
// a power loss.
const PRAGMAS = [
  'pragma busy_timeout = 5000',
  'pragma journal_mode = wal',
  'pragma synchronous = full',
  'pragma foreign_keys = on',
];

function startConnection(path: string): Database {
  const database = new Database(path, { create: true, strict: true });

  for (const pragma of PRAGMAS) {
    database.run(pragma);
  }
  return database;
}

function runQuery(
  database: Database,
  sql: string,
  parameters: readonly SQLQueryBindings[],
): WorkerQueryResult {
  const statement = database.prepare(sql);

  try {
    // a statement that names result columns returns rows, RETURNING included
    if (statement.columnNames.length > 0) {
      return { rows: statement.all(...parameters) };
    }
    const changes = statement.run(...parameters);

    return { rows: [], changes: changes.changes, lastInsertRowid: changes.lastInsertRowid };
  } finally {
    statement.finalize();
  }
}

function toWorkerError(error: unknown): WorkerError {
  if (error instanceof Error) {
    return { message: error.message, code: 'code' in error ? String(error.code) : undefined };
  }
  return { message: String(error), code: undefined };
}
