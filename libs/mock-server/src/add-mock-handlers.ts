import type { RequestHandler, WebSocketHandler } from 'msw';
import { mockServer } from './mock-server';

export function addMockHandlers(...handlers: (RequestHandler | WebSocketHandler)[]): void {
  // A reset with handlers makes them the ones that every later reset returns to.
  mockServer.resetHandlers(...mockServer.listHandlers(), ...handlers);
}
