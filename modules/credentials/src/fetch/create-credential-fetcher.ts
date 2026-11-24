import type { IncomingHttpHeaders } from 'node:http';
import type { AddressCheck } from '@heynixie/egress';
import {
  CredentialRefusalError,
  buildValueForms,
  findRefusedHeader,
  planHop,
  scrubBytes,
  scrubText,
} from '@heynixie/egress';
import type { CredentialFetch, CredentialSpec, FetchOptions } from '../types';
import { findCredentialHeader, placeCredential } from './place-credential';
import type { PlacedCredential } from './place-credential';
import { readCappedBody } from './read-capped-body';
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

  // the credential's value, read when a request sends
  readonly readValue: () => string | null;

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
    const request = new Request(String(input), init);

    const value = target.readValue();
    const forms = value === null ? [] : buildValueForms(value);

    try {
      return await sendRequest(checks, target, request, { value, forms });
    } catch (error) {
      throw cleanError(error, forms);
    }
  };
}

interface CredentialScrub {
  readonly value: string | null;
  readonly forms: readonly string[];
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

  refuseRequest(target, request, url);

  const body = await readRequestBody(request);

  const hop = { url, method: request.method, body, hasCredential: value !== null, count: 0 };

  for (;;) {
    refuseOrigin(target, hop.url);

    const placed = placeHop(target, hop, request.headers, value);

    const reply = await sendHop(checks, target, request.signal, {
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
      return readResponse(reply, forms);
    }

    reply.discard();

    if (hop.count === maxRedirects) {
      throw new CredentialRefusalError(
        `the service redirected more than ${String(maxRedirects)} times`,
      );
    }

    const next = new URL(location, hop.url);

    hop.hasCredential &&= next.origin === hop.url.origin;
    hop.url = next;
    hop.count += 1;

    if (reply.status !== 307 && reply.status !== 308 && hop.method !== 'HEAD') {
      hop.method = 'GET';
      hop.body = null;
    }
  }
}

function refuseRequest(target: FetcherTarget, request: Request, url: URL): void {
  if (url.username !== '' || url.password !== '') {
    throw new CredentialRefusalError('the request URL holds a user name or a password');
  }

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

function refuseOrigin(target: FetcherTarget, url: URL): void {
  if (!target.origins.includes(url.origin)) {
    throw new CredentialRefusalError(`${url.origin} is not an origin this credential may reach`);
  }

  if (url.protocol !== 'https:' && target.options.deploymentService !== true) {
    throw new CredentialRefusalError(`${url.origin} is not an https origin`);
  }
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
  readonly discard: () => void;
}

interface HopRequest {
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
  if (checks.transport !== undefined) {
    const response = await checks.transport(hop.url.href, {
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
      read: async () => {
        const buffer = await response.arrayBuffer();

        return new Uint8Array(buffer);
      },
      discard: () => {},
    };
  }

  const checkAddress = target.options.deploymentService === true ? () => true : checks.checkAddress;

  const planned = await planHop(hop.url.href, {
    checkAddress,
    resolveHost: checks.resolveHost,
    signal,
  });

  if (planned.kind === 'refused') {
    throw new CredentialRefusalError(planned.reason);
  }

  const response = await sendPinnedRequest({
    url: planned.url,
    address: planned.address,
    method: hop.method,
    headers: { ...Object.fromEntries(hop.headers), 'accept-encoding': 'gzip, deflate, br' },
    body: hop.body,
    signal,
    ...(checks.ca === undefined ? {} : { ca: checks.ca }),
  });

  return {
    status: response.statusCode ?? 502,
    statusText: response.statusMessage ?? '',
    headers: toHeaders(response.headers),
    read: () => readCappedBody(response),
    discard: () => {
      response.destroy();
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

async function readResponse(reply: HopReply, forms: readonly string[]): Promise<Response> {
  const raw = await reply.read();

  const body = scrubBytes(raw, forms);

  const headers = new Headers();

  for (const [name, entry] of reply.headers) {
    if (!['content-encoding', 'content-length'].includes(name)) {
      headers.append(name, scrubText(entry, forms));
    }
  }

  const isEmpty = reply.status === 204 || reply.status === 205 || reply.status === 304;
  const payload = isEmpty ? null : Buffer.from(body);

  return new Response(payload, {
    status: reply.status,
    statusText: scrubText(reply.statusText, forms),
    headers,
  });
}

function cleanError(error: unknown, forms: readonly string[]): unknown {
  if (error instanceof CredentialRefusalError) {
    return new CredentialRefusalError(scrubText(error.message, forms));
  }

  if (!(error instanceof Error)) {
    return new Error(scrubText(String(error), forms));
  }

  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return error;
  }

  const cleaned = new Error(scrubText(error.message, forms));

  cleaned.name = error.name;

  return cleaned;
}
