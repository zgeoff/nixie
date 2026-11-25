import { expect, test } from 'bun:test';
import { decodeRenderRequest } from '../render/decode-render-request';
import { encodeRenderMessage } from '../render/encode-render-message';
import { buildMockRenderRequest } from './build-mock-render-request';

test('it builds a request that the decoder reads back', () => {
  const request = buildMockRenderRequest({ width: 936, height: 702, pixelRatio: 2 });

  expect(decodeRenderRequest(encodeRenderMessage(request))).toStrictEqual(request);
});

test('it puts the script in the page', () => {
  const request = buildMockRenderRequest({ script: 'window.__x = 1;' });
  const page = Buffer.from(request.files[0]?.base64 ?? '', 'base64').toString('utf8');

  expect(page).toContain('<script>window.__x = 1;</script>');
});
