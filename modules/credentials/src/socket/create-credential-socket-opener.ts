import { CredentialRefusalError, buildValueForms, planHop } from '@heynixie/egress';
import { cleanError } from '../fetch/clean-error';
import type { FetcherChecks, FetcherTarget } from '../fetch/create-credential-fetcher';
import { placeCredential } from '../fetch/place-credential';
import { refuseOrigin } from '../fetch/refuse-origin';
import { refuseUserinfo } from '../fetch/refuse-userinfo';
import type { CredentialSocketOpener } from '../types';
import { createCredentialSocket } from './create-credential-socket';
import { sendPinnedUpgrade } from './send-pinned-upgrade';

// How long the handshake may take when the caller sets no limit. A site that accepts the connection
// and never answers the upgrade then fails the open, and never leaves it waiting.
const defaultHandshakeMs = 30_000;

// Opens a WebSocket with the credential added on the host, under the checks of the fetcher: the
// connection goes to the address the check passed. A redirect fails, as does every answer but the
// upgrade, and a handshake that outlasts its limit.
export function createCredentialSocketOpener(
  checks: FetcherChecks,
  target: FetcherTarget,
): CredentialSocketOpener {
  return async (input, init) => {
    const value = await target.readValue();

    const forms = value === null ? [] : buildValueForms(value);

    try {
      refuseUserinfo(input, 'the socket URL');

      const url = toWebURL(input);

      refuseOrigin(target, url);

      const placed =
        value === null || target.spec === null
          ? { url, headers: new Headers() }
          : placeCredential(target.spec, value, { url, headers: new Headers() });

      const handshake = new AbortController();

      const signal =
        init?.signal === undefined
          ? handshake.signal
          : AbortSignal.any([init.signal, handshake.signal]);

      const planned = await planHop(placed.url.href, {
        checkAddress: checks.checkAddress,
        resolveHost: checks.resolveHost,
        signal,
      });

      if (planned.kind === 'refused') {
        throw new CredentialRefusalError(planned.reason);
      }

      // The limit covers the handshake alone: an open socket outlives it.
      const limit = setTimeout(() => {
        handshake.abort(new Error('the server did not answer the upgrade in time'));
      }, init?.timeoutMs ?? defaultHandshakeMs);

      const connection = await sendPinnedUpgrade({
        url: planned.url,
        address: planned.address,
        headers: Object.fromEntries(placed.headers),
        signal,
        ...(checks.ca === undefined ? {} : { ca: checks.ca }),
      }).finally(() => {
        clearTimeout(limit);
      });

      return createCredentialSocket(connection, forms);
    } catch (error) {
      throw cleanError(error, forms);
    }
  };
}

const socketSchemes: Readonly<Record<string, string>> = { 'wss:': 'https:' };

function toWebURL(text: string): URL {
  const url = URL.parse(text);
  const scheme = url === null ? undefined : socketSchemes[url.protocol];

  if (url === null || scheme === undefined) {
    throw new CredentialRefusalError(`${text} is not a wss URL`);
  }

  const converted = new URL(url);

  converted.protocol = scheme;

  return converted;
}
