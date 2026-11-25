// What a test build of the server composes, with no import of the test runner: a credential store
// over the database backend and a real log.
export type { DatabaseTestStore, DatabaseTestStoreOptions } from './create-database-test-store';
export { createDatabaseTestStore } from './create-database-test-store';
export type { BackendHooks } from '../types';
