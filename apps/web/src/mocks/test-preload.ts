import { afterAll, afterEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { IDBFactory } from 'fake-indexeddb';
import { browserCookies } from './browser-cookies';
import { server } from './node';
import { store } from './store';
import { webOrigin } from './web-origin';

faker.seed(321);

// happy-dom has no IndexedDB.
globalThis.indexedDB = new IDBFactory();

// happy-dom opens on about:blank, where the browser client cannot resolve /rpc.
globalThis.happyDOM.setURL(`${webOrigin}/`);

server.listen({
  // The web server suites call a stub API and the built Start server on loopback ports, which MSW
  // must pass through. No DNS answers the reserved .test domain, so a test site there never
  // reaches the network.
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
