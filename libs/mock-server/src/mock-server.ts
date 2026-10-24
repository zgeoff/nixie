import { setupServer } from 'msw/node';

// A second MSW server in the process attaches to the first one's fetch interceptor, so both handle
// each request and read its body, and the first one's close stops the second. Every package adds
// its handlers to this one server instead.
export const mockServer = setupServer();
