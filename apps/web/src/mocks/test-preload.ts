import { afterAll, afterEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import type { Window } from 'happy-dom';
import { browserCookies } from './browser-cookies';
import { server } from './node';
import { store } from './store';
import { webOrigin } from './web-origin';

// The web client's test preload: it opens the tests' browser on the web origin, starts the mock
// API, and returns every piece of shared state to its baseline after each test.
faker.seed(321);

// happy-dom opens on about:blank, where the browser client cannot resolve /rpc.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the preload registered happy-dom's window
(globalThis as unknown as Window).happyDOM.setURL(`${webOrigin}/`);

server.listen({
  // the web server suites call a stub API and the built Start server on loopback ports
  onUnhandledRequest: (request, print) => {
    const hostname = new URL(request.url).hostname;

    if (['127.0.0.1', '[::1]', 'localhost'].includes(hostname)) {
      return;
    }

    print.error();
  },
});

afterEach(() => {
  server.resetHandlers();
  store.reset();
  browserCookies.clear();
  globalThis.localStorage.clear();
});

afterAll(() => {
  server.close();
});
