import { afterEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { addMockHandlers } from '@heynixie/mock-server';
import { IDBFactory } from 'fake-indexeddb';
import { createRoot } from 'react-dom/client';
import { browserCookies } from './browser-cookies';
import { connectionStore } from './connection-store';
import { handlers } from './handlers';
import { mockLive } from './mock-live';
import { store } from './store';
import { webOrigin } from './web-origin';

faker.seed(321);

// happy-dom has no IndexedDB.
globalThis.indexedDB = new IDBFactory();

// happy-dom opens on about:blank, where the browser client cannot resolve /rpc.
globalThis.happyDOM.setURL(`${webOrigin}/`);

// Any React root inside the document marks it as listened to, so a later root on the document
// itself, which the route tests render, adds no listener and hears no click. A root on the document
// here makes it listen before any test.
createRoot(globalThis.document).unmount();
addMockHandlers(...handlers);

afterEach(() => {
  store.reset();
  connectionStore.reset();
  mockLive.reset();
  browserCookies.clear();
  globalThis.localStorage.clear();

  globalThis.indexedDB = new IDBFactory();

  globalThis.happyDOM.settings.device.prefersColorScheme = 'light';
  delete globalThis.document.documentElement.dataset['theme'];
});
