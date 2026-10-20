import { afterAll, afterEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { IDBFactory } from 'fake-indexeddb';
import { browserCookies } from './browser-cookies';
import { server } from './node';
import { store } from './store';
import { webOrigin } from './web-origin';

// The web client's test preload: it opens the tests' browser on the web origin, gives it IndexedDB,
// which happy-dom lacks, starts the mock API, and returns every piece of shared state to its
// baseline after each test.
faker.seed(321);

globalThis.indexedDB = new IDBFactory();

// happy-dom opens on about:blank, where the browser client cannot resolve /rpc.
globalThis.happyDOM.setURL(`${webOrigin}/`);

server.listen({
  // the web server suites call a stub API and the built Start server on loopback ports, and the
  // fetcher's suites call test sites under the reserved .test domain, which no DNS answers
  onUnhandledRequest: (request, print) => {
    const hostname = new URL(request.url).hostname;

    if (['127.0.0.1', '[::1]', 'localhost'].includes(hostname) || hostname.endsWith('.test')) {
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

  globalThis.indexedDB = new IDBFactory();

  globalThis.happyDOM.settings.device.prefersColorScheme = 'light';
  delete globalThis.document.documentElement.dataset['theme'];
});

afterAll(() => {
  server.close();
});
