import { encodeTestImage } from '@heynixie/connectors/test-utils';
import type { FetchReply, FetchRequest } from '@heynixie/wire';
import {
  decodeFetchRequest,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';

// Stands in for the fetch guest in a test sandbox, because the guest refuses every address a test
// can serve.
const decode = makeFrameDecoder(65_536);
let reply: FetchReply = { kind: 'failed', reason: 'the stub fetcher read no request' };

for await (const chunk of Bun.stdin.stream()) {
  const [message] = decode(chunk);

  if (message !== undefined) {
    reply = await answerRequest(decodeFetchRequest(message));

    break;
  }
}

process.stdout.write(encodeFrame(encodeFetchMessage(reply)));

async function answerRequest(request: FetchRequest): Promise<FetchReply> {
  const name = new URL(request.url).pathname.split('/').pop() ?? '';
  const size = /^(?<width>\d+)x(?<height>\d+)\.png$/u.exec(name)?.groups;

  if (size?.['width'] === undefined || size['height'] === undefined) {
    const text = 'x'.repeat(Number(name));

    return {
      kind: 'page',
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
    url: request.url,
    status: 200,
    contentType: 'image/png',
    base64: Buffer.from(png).toString('base64'),
  };
}
