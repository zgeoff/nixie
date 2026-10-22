import type { FetchReply } from '@heynixie/wire';
import {
  decodeFetchRequest,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';

// Stands in for the fetch guest in a test sandbox, because the guest refuses every address a test
// can serve. The URL's last path part names how many bytes of text the page holds, and the reply
// keeps the request's text limit as the guest does.
const decode = makeFrameDecoder(65_536);
let reply: FetchReply = { kind: 'failed', reason: 'the stub fetcher read no request' };

for await (const chunk of Bun.stdin.stream()) {
  const [message] = decode(chunk);

  if (message !== undefined) {
    const request = decodeFetchRequest(message);
    const size = Number(new URL(request.url).pathname.split('/').pop());
    const text = 'x'.repeat(size);

    reply = {
      kind: 'page',
      url: request.url,
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      text: text.slice(0, request.limits.textBytes),
      links: [],
      isTruncated: text.length > request.limits.textBytes,
      blocked: null,
    };

    break;
  }
}

process.stdout.write(encodeFrame(encodeFetchMessage(reply)));
