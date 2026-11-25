import { join } from 'node:path';
import { encodeTestImage } from '@heynixie/connectors/test-utils';
import type { FetchReply, FetchRequest } from '@heynixie/wire';
import {
  decodeFetchReply,
  decodeFetchRequest,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
  maxFetchRequestBytes,
} from '@heynixie/wire';

// Stands in for the fetch guest in a test sandbox, because the guest refuses every address a test
// can serve. A request that holds HTML makes no network request, so the real guest answers it.
const decode = makeFrameDecoder(maxFetchRequestBytes);
const guestEntry = join(import.meta.dir, '../../../../guests/fetch/src/main.ts');

let reply: FetchReply = {
  kind: 'failed',
  reason: 'the stub fetcher read no request',
  isGated: false,
};

for await (const chunk of Bun.stdin.stream()) {
  const [message] = decode(chunk);

  if (message !== undefined) {
    reply = await answerRequest(decodeFetchRequest(message));

    break;
  }
}

process.stdout.write(encodeFrame(encodeFetchMessage(reply)));

async function answerRequest(request: FetchRequest): Promise<FetchReply> {
  if (request.html !== undefined) {
    return askGuest(request);
  }

  const name = new URL(request.url).pathname.split('/').pop() ?? '';
  const size = /^(?<width>\d+)x(?<height>\d+)\.png$/u.exec(name)?.groups;

  if (size?.['width'] === undefined || size['height'] === undefined) {
    const text = 'x'.repeat(Number(name));

    return {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      text: text.slice(0, request.limits.textBytes),
      links: [],
      isTruncated: text.length > request.limits.textBytes,
      blocked: null,
    };
  }

  const png = await encodeTestImage(
    { width: Number(size['width']), height: Number(size['height']) },
    'png',
  );

  if (png.byteLength > request.limits.imageBytes) {
    return {
      kind: 'page',
      retryAfterMs: null,
      isGated: false,
      url: request.url,
      status: 200,
      contentType: 'image/png',
      text: null,
      links: [],
      isTruncated: true,
      blocked: null,
    };
  }

  return {
    kind: 'image',
    retryAfterMs: null,
    isGated: false,
    url: request.url,
    status: 200,
    contentType: 'image/png',
    base64: Buffer.from(png).toString('base64'),
  };
}

async function askGuest(request: FetchRequest): Promise<FetchReply> {
  const frame = encodeFrame(encodeFetchMessage(request));

  const guest = Bun.spawn([process.execPath, guestEntry], {
    stdin: new Blob([frame]),
    stdout: 'pipe',
    stderr: 'inherit',
  });

  const output = await new Response(guest.stdout).arrayBuffer();

  const decodeReply = makeFrameDecoder(maxFetchRequestBytes);
  const [message] = decodeReply(new Uint8Array(output));

  await guest.exited;

  return message === undefined
    ? { kind: 'failed', reason: 'the fetch guest sent no reply', isGated: false }
    : decodeFetchReply(message);
}
