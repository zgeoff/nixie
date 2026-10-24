import { afterEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { addMockHandlers } from '@heynixie/mock-server';
import { IDBFactory } from 'fake-indexeddb';
import { browserCookies } from './browser-cookies';
import { handlers } from './handlers';
import { store } from './store';
import { webOrigin } from './web-origin';

faker.seed(321);

// happy-dom has no IndexedDB.
globalThis.indexedDB = new IDBFactory();

// happy-dom opens on about:blank, where the browser client cannot resolve /rpc.
globalThis.happyDOM.setURL(`${webOrigin}/`);

addMockHandlers(...handlers);

afterEach(() => {
  store.reset();
  browserCookies.clear();
  globalThis.localStorage.clear();

  globalThis.indexedDB = new IDBFactory();

  globalThis.happyDOM.settings.device.prefersColorScheme = 'light';
  delete globalThis.document.documentElement.dataset['theme'];
});
