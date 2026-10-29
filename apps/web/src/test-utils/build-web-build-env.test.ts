import { expect, test } from 'bun:test';
import { buildWebBuildEnv } from './build-web-build-env';

test('it turns off Node’s wasm trap handler, so the build runs under an address-space cap', () => {
  expect(buildWebBuildEnv({ PATH: '/usr/bin' })).toStrictEqual({
    PATH: '/usr/bin',
    NODE_OPTIONS: '--disable-wasm-trap-handler',
  });
});

test('it keeps the Node options the environment already sets', () => {
  expect(buildWebBuildEnv({ NODE_OPTIONS: '--max-old-space-size=512' })).toStrictEqual({
    NODE_OPTIONS: '--max-old-space-size=512 --disable-wasm-trap-handler',
  });
});
