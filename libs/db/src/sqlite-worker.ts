// The worker that owns nixie's one bun:sqlite connection, so a slow query or a synchronous fsync
// never blocks the main thread's event loop.
import type { SQLQueryBindings } from 'bun:sqlite';
import { Database } from 'bun:sqlite';
import type {
  DatabaseOptions,
  WorkerError,
  WorkerQueryResult,
  WorkerRequest,
  WorkerResponse,
} from './types';

// a worker's global scope sends and receives messages the way a Worker handle does
declare const self: Worker;

// transactionOpen records that the dialect opened a transaction, which SQLite can roll back on its
// own after an error, such as a trigger's RAISE(ROLLBACK)
const state: { database: Database | null; transactionOpen: boolean } = {
  database: null,
  transactionOpen: false,
};

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
    state.database = startConnection(request.path, request.options);
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
  return runTransactionStep(state.database, request.sql, request.parameters);
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

function startConnection(path: string, options: DatabaseOptions): Database {
  const database = new Database(path, { create: true, strict: true });

  for (const pragma of PRAGMAS) {
    database.run(pragma);
  }
  if (options.secureDelete === true) {
    database.run('pragma secure_delete = on');
  }
  return database;
}

// Keeps a transaction's statements inside it. Once SQLite has rolled the transaction back, a later
// statement would commit on its own, outside the transaction and its writer epoch check.
function runTransactionStep(
  database: Database,
  sql: string,
  parameters: readonly SQLQueryBindings[],
): WorkerQueryResult {
  if (sql === 'commit' || sql === 'rollback') {
    return runTransactionEnd(database, sql);
  }
  if (state.transactionOpen && !database.inTransaction) {
    throw new Error('SQLite rolled the transaction back after an earlier error');
  }
  const result = runQuery(database, sql, parameters);

  if (sql === 'begin immediate') {
    state.transactionOpen = true;
  }
  return result;
}

function runTransactionEnd(database: Database, sql: 'commit' | 'rollback'): WorkerQueryResult {
  const rolledBack = state.transactionOpen && !database.inTransaction;

  state.transactionOpen = false;
  if (rolledBack && sql === 'rollback') {
    return { rows: [] };
  }
  if (rolledBack) {
    throw new Error(
      'SQLite rolled the transaction back after an earlier error, so nothing committed',
    );
  }
  return runQuery(database, sql, []);
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

    // Database.run runs every statement in the text, where a prepared statement runs only the first
    const changes = database.run(sql, [...parameters]);

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
