import { beforeAll } from 'bun:test';

// The happy-dom preload keeps Bun's own fetch stack but replaces File and FormData, and Bun's fetch
// cannot send happy-dom's as a multipart body. This preload loads first and puts the native ones
// back once every preload has run, so a test can send a file as a browser or a server process does.
const native = { File: globalThis.File, FormData: globalThis.FormData };

beforeAll(() => {
  Object.assign(globalThis, native);
});
