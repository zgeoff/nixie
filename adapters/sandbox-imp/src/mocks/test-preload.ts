import { afterAll } from 'bun:test';
import { stopSharedImpd } from './stop-shared-impd';

// The test preload stops the impd that a file's tests share. It imports nothing that loads
// @impz/testing, because every test file of the repo loads this preload.
afterAll(stopSharedImpd);
