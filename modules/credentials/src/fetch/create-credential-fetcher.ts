import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import type { AddressCheck, ValueForm } from '@heynixie/egress';
import {
  CredentialRefusalError,
  buildValueForms,
  findRefusedHeader,
  makeRangeCheck,
  planHop,
  scrubBytes,
  scrubText,
  toBareHost,
  toCaseInsensitiveForms,
} from '@heynixie/egress';
import type { CredentialFetch, CredentialSpec, FetchOptions } from '../types';
import { cleanError } from './clean-error';
import { findCredentialHeader, placeCredential } from './place-credential';
import type { PlacedCredential } from './place-credential';
import { readCappedBody } from './read-capped-body';
import { readCappedStream } from './read-capped-stream';
import { refuseOrigin } from './refuse-origin';
import { refuseUserinfo } from './refuse-userinfo';
import { scrubEventStream } from './scrub-event-stream';
import { sendPinnedRequest } from './send-pinned-request';

export interface FetcherChecks {
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly checkAddress: AddressCheck;

  // a certificate authority a test site signs with
  readonly ca?: string;

  // what a test build sends each hop through, after every check, so a mock network answers it
  readonly transport?: (url: string, init: RequestInit) => Promise<Response>;
}

export interface FetcherTarget {
  readonly spec: CredentialSpec | null;

  // the credential's value, read when a request sends. A read that throws stops the request.
  readonly readValue: () => string | null | Promise<string | null>;

  // values that go in the request body, and that the response never shows: cut from the response
  // and from an error, though never placed
  readonly bodyValues?: readonly string[];

  // Runs `start`, which hands the request off, after each hop's checks, under the credential's lock
  // from its own check until `start` returns, so no removal lands between the check and the send.
  // An error it throws reaches the caller as it is.
  readonly withSendCheck?: <T>(start: () => T) => Promise<T>;

  // The host names of an OAuth provider's token, revoke and authorize endpoints. With them set, the
  // fetcher also refuses every path under /oauth2/, on any host, so no tool reaches a token or
  // revocation endpoint.
  readonly oauthHostnames?: readonly string[];

  // the origins the caller passed, all inside the spec's
  readonly origins: readonly string[];
  readonly options: FetchOptions;
}

// The shape of the global fetch, with the credential added on the host. A call to an origin the
// caller did not pass, a non-public address on any hop, or a request that sets an identity header of
// its own never leaves the host.
export function createCredentialFetcher(
  checks: FetcherChecks,
  target: FetcherTarget,
): CredentialFetch {
  return async (input, init) => {
    const value = await target.readValue();

    const forms = [value, ...(target.bodyValues ?? [])].flatMap((held) =>
      held === null ? [] : buildValueForms(held),
    );

    try {
      refuseUserinfo(String(input), 'the request URL');

      const request = new Request(String(input), init);

      return await sendRequest(checks, target, request, { value, forms });
    } catch (error) {
      throw cleanError(error, forms);
    }
  };
}

interface CredentialScrub {
  readonly value: string | null;
  readonly forms: readonly ValueForm[];
}

const maxRedirects = 5;

const redirectStatuses: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

async function sendRequest(
  checks: FetcherChecks,
  target: FetcherTarget,
  request: Request,
  scrub: CredentialScrub,
): Promise<Response> {
  const value = scrub.value;
  const forms = scrub.forms;

  const url = new URL(request.url);

  refuseHeaders(target, request);

  const body = await readRequestBody(request);

  const hop = {
    url,
    method: request.method,
    body,
    hasCredential: value !== null,
    count: 0,
  };

  for (;;) {
    refuseOrigin(target, hop.url);

    const placed = placeHop(target, hop, request.headers, value);

    const reply = await sendHop(checks, target, request.signal, {
      isStream: target.options.stream === true,
      url: placed.url,
      method: hop.method,
      headers: placed.headers,
      body: hop.body,
    });

    const location = reply.headers.get('location');

    if (
      !redirectStatuses.has(reply.status) ||
      location === null ||
      target.options.redirects === 'none'
    ) {
      return readResponse(reply, forms, target.options.stream === true);
    }

    reply.discard();

    if (hop.count === maxRedirects) {
      throw new CredentialRefusalError(
        `the service redirected more than ${String(maxRedirects)} times`,
      );
    }

    const next = new URL(location, hop.url);

    refuseUserinfo(next.href, 'the redirect');

    hop.hasCredential &&= next.origin === hop.url.origin;
    hop.url = next;
    hop.count += 1;

    if (reply.status !== 307 && reply.status !== 308 && hop.method !== 'HEAD') {
      hop.method = 'GET';
      hop.body = null;
    }
  }
}

function refuseHeaders(target: FetcherTarget, request: Request): void {
  const refused = findRefusedHeader(request.headers.keys(), findCredentialHeader(target.spec));

  if (refused !== null) {
    throw new CredentialRefusalError(
      `the request sets the ${refused} header, which only nixie sets`,
    );
  }
}

async function readRequestBody(request: Request): Promise<Uint8Array | null> {
  if (request.body === null) {
    return null;
  }

  const buffer = await request.arrayBuffer();

  return new Uint8Array(buffer);
}

interface HopState {
  readonly url: URL;
  readonly hasCredential: boolean;
}

function placeHop(
  target: FetcherTarget,
  hop: HopState,
  headers: Headers,
  value: string | null,
): PlacedCredential {
  if (hop.hasCredential && value !== null && target.spec !== null) {
    return placeCredential(target.spec, value, { url: hop.url, headers });
  }

  return { url: hop.url, headers: new Headers(headers) };
}

interface HopReply {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly read: () => Promise<Uint8Array>;

  // the body as it arrives, for a stream; the fetcher asks for no content encoding then
  readonly readStream: () => ReadableStream<Uint8Array>;
  readonly discard: () => void;
}

interface HopRequest {
  // a stream is read as it arrives, so the server is asked for no content encoding
  readonly isStream: boolean;
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly body: Uint8Array | null;
}

async function sendHop(
  checks: FetcherChecks,
  target: FetcherTarget,
  signal: AbortSignal,
  hop: HopRequest,
): Promise<HopReply> {
  const isDeploymentService = target.options.deploymentService === true;

  const planned = await planHop(hop.url.href, {
    checkAddress: pickAddressCheck(checks, target, hop.url),
    resolveHost: checks.resolveHost,
    signal,
    allowIPv6Only: isDeploymentService,
  });

  if (planned.kind === 'refused') {
    throw new CredentialRefusalError(planned.reason);
  }

  // The reply goes in an object, so the lock is released once the request is handed off and not
  // held until the answer comes.
  const start = () => ({ reply: startHop(checks, signal, planned, hop) });
  const started = target.withSendCheck === undefined ? start() : await target.withSendCheck(start);

  return started.reply;
}

// A hop to the host that a pairing names passes on an address in the pairing's range. Every other hop
// passes only a public address, unless the target is the deployment's own service.
function pickAddressCheck(checks: FetcherChecks, target: FetcherTarget, url: URL): AddressCheck {
  if (target.options.deploymentService === true) {
    return () => true;
  }

  const pairing = target.options.pairing;

  if (pairing !== undefined && toBareHost(url.hostname) === pairing.host) {
    return makeRangeCheck(pairing.range);
  }

  return checks.checkAddress;
}

interface PlannedAddress {
  readonly url: URL;
  readonly address: string;
}

// Hands the request off before it returns: nothing it does before the send waits.
function startHop(
  checks: FetcherChecks,
  signal: AbortSignal,
  planned: PlannedAddress,
  hop: HopRequest,
): Promise<HopReply> {
  if (checks.transport !== undefined) {
    return sendThroughTransport(checks.transport, signal, hop);
  }

  const response = sendPinnedRequest({
    url: planned.url,
    address: planned.address,
    method: hop.method,
    headers: {
      ...Object.fromEntries(hop.headers),
      'accept-encoding': hop.isStream ? 'identity' : 'gzip, deflate, br',
    },
    body: hop.body,
    signal,
    ...(checks.ca === undefined ? {} : { ca: checks.ca }),
  });

  return response.then((answer) => ({
    status: answer.statusCode ?? 502,
    statusText: answer.statusMessage ?? '',
    headers: toHeaders(answer.headers),
    read: () => readCappedBody(answer),
    readStream: () => toWebStream(answer),
    discard: () => {
      answer.destroy();
    },
  }));
}

async function sendThroughTransport(
  transport: NonNullable<FetcherChecks['transport']>,
  signal: AbortSignal,
  hop: HopRequest,
): Promise<HopReply> {
  const response = await transport(hop.url.href, {
    method: hop.method,
    headers: hop.headers,
    ...(hop.body === null ? {} : { body: Buffer.from(hop.body) }),
    redirect: 'manual',
    signal,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    read: () => readCappedStream(response.body),
    readStream: () => response.body ?? new ReadableStream<Uint8Array>(),
    discard: () => {
      void response.body?.cancel();
    },
  };
}

function toHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();

  for (const [name, entry] of Object.entries(raw)) {
    for (const text of Array.isArray(entry) ? entry : [entry ?? '']) {
      headers.append(name, text);
    }
  }

  return headers;
}

// The body of a Node response as a web stream, which ends the request when the reader cancels.
function toWebStream(source: Readable): ReadableStream<Uint8Array> {
  const chunks = source[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const next = await chunks.next();

      if (next.done === true) {
        controller.close();
      } else {
        controller.enqueue(Buffer.from(next.value));
      }
    },
    cancel: () => {
      source.destroy();
    },
  });
}

async function readResponse(
  reply: HopReply,
  forms: readonly ValueForm[],
  isStreamAllowed: boolean,
): Promise<Response> {
  const nameForms = toCaseInsensitiveForms(forms);

  const headers = new Headers();

  for (const [name, entry] of reply.headers) {
    // A header name that holds the value cannot carry the marker, so the header goes whole.
    const isDropped =
      ['content-encoding', 'content-length'].includes(name) || scrubText(name, nameForms) !== name;

    if (!isDropped) {
      headers.append(name, scrubText(entry, forms));
    }
  }

  const isEmpty = reply.status === 204 || reply.status === 205 || reply.status === 304;
  const isStream = isStreamAllowed && !isEmpty && isEventStream(reply.headers);
  const payload = isEmpty ? null : await readPayload(reply, forms, isStream);

  return new Response(payload, {
    status: reply.status,
    statusText: scrubText(reply.statusText, forms),
    headers,
  });
}

function isEventStream(headers: Headers): boolean {
  return (headers.get('content-type') ?? '').toLowerCase().startsWith('text/event-stream');
}

async function readPayload(
  reply: HopReply,
  forms: readonly ValueForm[],
  isStream: boolean,
): Promise<ReadableStream<Uint8Array> | Blob> {
  if (isStream) {
    return scrubEventStream(reply.readStream(), forms);
  }

  const raw = await reply.read();

  return new Blob([Buffer.from(scrubBytes(raw, forms))]);
}
