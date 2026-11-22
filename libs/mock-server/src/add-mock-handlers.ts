import { beforeEach } from 'bun:test';
import type { RequestHandler } from 'msw';
import { network } from './network';

// Call it from a package's test preload, so each test of the run starts with these handlers. A
// handler that a test adds with `network.use` answers before them.
export function addMockHandlers(...handlers: readonly RequestHandler[]): void {
  beforeEach(() => {
    network.use(...handlers);
  });
}
