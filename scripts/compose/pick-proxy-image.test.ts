import { expect, test } from 'bun:test';
import { pickProxyImage } from './pick-proxy-image.ts';

test('#pickProxyImage reads the proxy image with its tag and digest', () => {
  const compose = [
    'services:',
    '  proxy:',
    '    image: caddy:2.11.9-alpine@sha256:003a97808e781aa9',
    '  web:',
    '    image: ghcr.io/example/web:1.0.0',
  ].join('\n');

  expect(pickProxyImage(compose)).toBe('caddy:2.11.9-alpine@sha256:003a97808e781aa9');
});

test('#pickProxyImage finds no image in a recipe with no proxy', () => {
  expect(pickProxyImage('services:\n  web:\n    image: ghcr.io/example/web:1.0.0')).toBeNull();
});
