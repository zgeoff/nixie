import type { DatabaseConnection, Dialect, Driver, QueryResult, TransactionSettings } from 'kysely';
import { CompiledQuery, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';
import { DatabaseError } from './database-error';
import type { DatabaseOptions, WorkerQueryResult, WorkerRequest, WorkerResponse } from './types';

// nixie's Kysely dialect for bun:sqlite. One worker holds the one connection, so no query blocks
// the main thread, and Kysely queues every query behind the one in flight, because SqliteAdapter
// declares a single connection.
export function buildSqliteWorkerDialect(path: string, options: DatabaseOptions = {}): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => buildDriver(path, options),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  };
}

interface DriverState {
  worker: SqliteWorker | null;
  connection: DatabaseConnection | null;
}

function buildDriver(path: string, options: DatabaseOptions): Driver {
  const state: DriverState = { worker: null, connection: null };

  return {
    async init() {
      const worker = startSqliteWorker();

      state.worker = worker;
      await worker.send({ kind: 'open', path, options });
      state.connection = buildConnection(worker);
    },
    acquireConnection() {
      if (state.connection === null) {
        return Promise.reject(new Error('the SQLite worker dialect is not initialised'));
      }
      return Promise.resolve(state.connection);
    },
    beginTransaction: runBegin,
    commitTransaction: (connection) => runStatement(connection, 'commit'),
    rollbackTransaction: (connection) => runStatement(connection, 'rollback'),
    releaseConnection: () => Promise.resolve(),
    async destroy() {
      await state.worker?.stop();
      state.worker = null;
      state.connection = null;
    },
  };
}

interface SqliteWorker {
  readonly send: (request: DistributiveOmit<WorkerRequest, 'id'>) => Promise<WorkerQueryResult>;
  readonly stop: () => Promise<void>;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface PendingRequest {
  readonly resolve: (result: WorkerQueryResult) => void;
  readonly reject: (error: Error) => void;
}

function startSqliteWorker(): SqliteWorker {
  const ids = { next: 0 },
    pending = new Map<number, PendingRequest>(),
    worker = new Worker(new URL('sqlite-worker.ts', import.meta.url).href);

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);

    pending.delete(event.data.id);
    applyResponse(request, event.data);
  });
  worker.addEventListener('error', (event: ErrorEvent) => {
    const error = new Error(`the SQLite worker failed: ${event.message}`);

    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  });

  return {
    send(request) {
      const id = ids.next,
        promise = Promise.withResolvers<WorkerQueryResult>();

      ids.next += 1;
      pending.set(id, promise);

      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker takes no origin
      worker.postMessage({ ...request, id });

      return promise.promise;
    },
    async stop() {
      await this.send({ kind: 'close' });
      worker.terminate();
    },
  };
}

function applyResponse(request: PendingRequest | undefined, response: WorkerResponse): void {
  if (request === undefined) {
    return;
  }
  if (response.ok) {
    request.resolve(response.result);
  } else {
    request.reject(new DatabaseError(response.error.message, response.error.code));
  }
}

function buildConnection(worker: SqliteWorker): DatabaseConnection {
  return {
    async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
      const result = await worker.send({
        kind: 'query',
        sql: compiledQuery.sql,
        parameters: toWorkerParameters(compiledQuery.parameters),
      });

      return buildQueryResult<R>(result);
    },

    // the worker returns every row at once, so a stream yields them as one chunk
    async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
      yield await this.executeQuery<R>(compiledQuery);
    },
  };
}

type WorkerParameters = Extract<WorkerRequest, { kind: 'query' }>['parameters'];

// Kysely's SQLite compiler emits only values bun:sqlite binds: strings, numbers, bigints, booleans,
// null and byte arrays
function toWorkerParameters(parameters: readonly unknown[]): WorkerParameters {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the compiler's output, above
  return parameters as WorkerParameters;
}

function buildQueryResult<R>(result: WorkerQueryResult): QueryResult<R> {
  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller's query names R
    rows: result.rows as R[],
    ...(result.changes === undefined ? {} : { numAffectedRows: BigInt(result.changes) }),
    ...(result.lastInsertRowid === undefined ? {} : { insertId: BigInt(result.lastInsertRowid) }),
  };
}

// a plain BEGIN takes a read snapshot that a later write cannot upgrade once another process has
// committed, so every transaction takes the write lock as it opens
async function runBegin(
  connection: DatabaseConnection,
  settings: TransactionSettings,
): Promise<void> {
  if (settings.isolationLevel !== undefined || settings.accessMode !== undefined) {
    throw new Error('SQLite transactions take no isolation level or access mode');
  }
  await runStatement(connection, 'begin immediate');
}

async function runStatement(connection: DatabaseConnection, statement: string): Promise<void> {
  await connection.executeQuery(CompiledQuery.raw(statement));
}
