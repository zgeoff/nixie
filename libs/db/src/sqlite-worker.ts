import type { SQLQueryBindings } from 'bun:sqlite';
import { Database } from 'bun:sqlite';
import type {
  DatabaseOptions,
  WorkerError,
  WorkerQueryResult,
  WorkerRequest,
  WorkerResponse,
} from './types';

declare const self: Worker;

const state: { database: Database | null; transactionOpen: boolean } = {
  database: null,
  transactionOpen: false,
};

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker takes no origin
  self.postMessage(answerRequest(event.data));
});

function answerRequest(request: WorkerRequest): WorkerResponse {
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

const defaultBusyTimeoutMs = 5000;

// busy_timeout comes first, so the statements after it wait for another connection's lock. FULL
// fsyncs every commit, so a claimed outside action survives a power loss.
function startConnection(path: string, options: DatabaseOptions): Database {
  const readonly = options.readonly === true;

  const database = new Database(path, { readonly, create: !readonly, strict: true });

  const busyTimeoutMs = options.busyTimeoutMs ?? defaultBusyTimeoutMs;

  database.run(`pragma busy_timeout = ${String(busyTimeoutMs)}`);

  if (readonly) {
    return database;
  }

  updateJournalMode(database, Date.now() + busyTimeoutMs);

  database.run('pragma synchronous = full');
  database.run('pragma foreign_keys = on');

  if (options.secureDelete === true) {
    database.run('pragma secure_delete = on');
  }

  return database;
}

// SQLite refuses one of two connections that switch a new file to WAL at once with SQLITE_BUSY,
// without its busy handler, to avoid a deadlock, so the switch retries until the deadline.
function updateJournalMode(database: Database, deadline: number): void {
  try {
    database.run('pragma journal_mode = wal');
  } catch (error) {
    if (!isBusyError(error) || Date.now() >= deadline) {
      throw error;
    }

    Bun.sleepSync(walRetryMs);

    updateJournalMode(database, deadline);
  }
}

function isBusyError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'SQLITE_BUSY';
}

const walRetryMs = 5;

// SQLite can roll a transaction back on its own after an error, and a later statement then
// commits on its own, outside the transaction.
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
    if (statement.columnNames.length > 0) {
      return { rows: statement.all(...parameters) };
    }

    // Database.run runs every statement in the text, and a prepared statement runs only the first.
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
