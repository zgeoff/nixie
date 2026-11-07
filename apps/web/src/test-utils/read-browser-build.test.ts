import { expect, test } from 'bun:test';
import { readBrowserBuild } from './read-browser-build';

test('it lays the web build and the image normaliser out in the browser lane build folder', () => {
  expect(readBrowserBuild({ RIG_BROWSER_BUILD_DIR: '/cache/run-9/build' })).toStrictEqual({
    webDir: '/cache/run-9/build/web',
    webServerPath: '/cache/run-9/build/web/server/server.js',
    normalizeImagePath: '/cache/run-9/build/normalize-image.js',
  });
});

test('it throws outside the browser lane, where no build folder is set', () => {
  expect(() => readBrowserBuild({})).toThrow(/RIG_BROWSER_BUILD_DIR/u);
});
