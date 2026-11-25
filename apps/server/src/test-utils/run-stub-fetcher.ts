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
// can serve. A request for a body or a package goes to the real reader on the test site that the
// first argument names, and a request that holds HTML goes to the real guest.
const guestEntry = join(import.meta.dir, '../../../../guests/fetch/src/main.ts');

const siteEntry = join(
  import.meta.dir,
  '../../../../guests/fetch/src/test-utils/run-site-fetcher.ts',
);

const [siteURL] = Bun.argv.slice(2);

await runStub();

interface PipedInput {
  readonly read: () => Promise<{ readonly done: boolean; readonly value?: Uint8Array | undefined }>;
}

interface PipedOutput {
  readonly write: (bytes: Uint8Array) => unknown;
  readonly flush: () => unknown;
}

async function runStub(): Promise<void> {
  const reader = Bun.stdin.stream().getReader();

  const first = await reader.read();

  const asked = first.value === undefined ? null : readRequest(first.value);

  if (first.value === undefined || asked === null) {
    const failure: FetchReply = {
      kind: 'failed',
      reason: 'the stub fetcher read no request',
      isGated: false,
    };

    process.stdout.write(encodeFrame(encodeFetchMessage(failure)));
  } else if (asked.mode === undefined) {
    const reply = await answerRequest(asked);

    process.stdout.write(encodeFrame(encodeFetchMessage(reply)));
  } else {
    await relayToSite(first.value, reader);
  }

  await reader.cancel();
}

function readRequest(bytes: Uint8Array): FetchRequest | null {
  const [frame] = makeFrameDecoder(maxFetchRequestBytes)(bytes);

  return frame === undefined ? null : decodeFetchRequest(frame);
}

// Passes the whole conversation on to the site's reader, hop frames included.
async function relayToSite(firstBytes: Uint8Array, input: PipedInput): Promise<void> {
  const site = Bun.spawn(
    [process.execPath, siteEntry, ...(siteURL === undefined ? [] : [siteURL])],
    { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' },
  );

  site.stdin.write(firstBytes);
  site.stdin.flush();
  void pipeRest(input, site.stdin);

  await site.exited;
}

async function pipeRest(input: PipedInput, output: PipedOutput): Promise<void> {
  for (let next = await input.read(); next.value !== undefined; next = await input.read()) {
    output.write(next.value);
    output.flush();
  }
}

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
