import { afterEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { devicePagePaths } from '@heynixie/contract';
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

// A frame of the device page loads a document with no script, which the interceptor answers.
globalThis.happyDOM.settings.enableIframePageLoading = true;
globalThis.happyDOM.settings.disableIframePageLoading = false;

globalThis.happyDOM.settings.fetch.interceptor = {
  beforeAsyncRequest: (context) => {
    const isFrame = new URL(context.request.url).pathname.startsWith(devicePagePaths.frames);

    const frame = new context.window.Response('<!doctype html><title>page</title>', {
      headers: { 'content-type': 'text/html' },
    });

    const answer = isFrame ? frame : undefined;

    return Promise.resolve(answer);
  },
};

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
