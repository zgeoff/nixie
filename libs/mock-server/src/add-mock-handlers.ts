import type { RequestHandler, WebSocketHandler } from 'msw';
import { mockServer } from './mock-server';
import { unmatchedRequestHandler } from './unmatched-request-handler';

export function addMockHandlers(...handlers: (RequestHandler | WebSocketHandler)[]): void {
  const current = mockServer
    .listHandlers()
    .filter((handler) => handler !== unmatchedRequestHandler);

  // A reset with handlers makes them the ones that every later reset returns to.
  mockServer.resetHandlers(...current, ...handlers, unmatchedRequestHandler);
}
