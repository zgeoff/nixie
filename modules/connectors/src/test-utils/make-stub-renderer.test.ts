import { expect, test } from 'bun:test';
import type { RenderRequest } from '@heynixie/wire';
import { decodeRenderReply, encodeFrame, encodeRenderMessage } from '@heynixie/wire';
import { buildMockRenderRequest } from '@heynixie/wire/test-utils';
import { makeStubRenderer } from './make-stub-renderer';

test('it answers the request it reads and hands the request to the test', async () => {
  const received: RenderRequest[] = [];

  const guest = makeStubRenderer(
    () => ({ kind: 'picture', base64: 'AQID', refused: [] }),
    received,
  );

  const input = new TransformStream<Uint8Array, Uint8Array>(
    {},
    { highWaterMark: Number.POSITIVE_INFINITY },
    { highWaterMark: Number.POSITIVE_INFINITY },
  );

  const output = new TransformStream<Uint8Array, Uint8Array>(
    {},
    { highWaterMark: Number.POSITIVE_INFINITY },
    { highWaterMark: Number.POSITIVE_INFINITY },
  );

  const request = buildMockRenderRequest({ width: 40 });
  const inputWriter = input.writable.getWriter();

  await inputWriter.write(encodeFrame(encodeRenderMessage(request)));

  const exit = await guest(input.readable, output.writable.getWriter());
  const reply = await output.readable.getReader().read();

  expect({
    exit,
    received,
    reply: decodeRenderReply(reply.value?.subarray(4) ?? new Uint8Array()),
  }).toStrictEqual({
    exit: 0,
    received: [request],
    reply: { kind: 'picture', base64: 'AQID', refused: [] },
  });
});
