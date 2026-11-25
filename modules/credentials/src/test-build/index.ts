// What a test build of the server composes, with no import of the test runner: a held store over a
// real log, and the spec of a fake provider's credential.
export { buildHeldSpec } from '../test-utils/build-held-spec';
export type { HeldTestStore, HeldTestStoreOptions } from '../test-utils/create-held-test-store';
export { createHeldTestStore } from '../test-utils/create-held-test-store';
