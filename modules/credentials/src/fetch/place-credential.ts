import type { CredentialSpec } from '../types';

// The header a placement writes, which a caller may never set. A path placement writes none.
export function findCredentialHeader(spec: CredentialSpec | null): string | null {
  if (spec === null) {
    return null;
  }

  const placement = spec.placement;

  if (placement === undefined || 'basic' in placement) {
    return 'authorization';
  }

  return 'header' in placement ? placement.header : null;
}

export interface PlacedCredential {
  readonly url: URL;
  readonly headers: Headers;
}

export function placeCredential(
  spec: CredentialSpec,
  value: string,
  target: PlacedCredential,
): PlacedCredential {
  const placement = spec.placement;

  const headers = new Headers(target.headers);
  const url = new URL(target.url);

  if (placement === undefined) {
    headers.set('authorization', `Bearer ${value}`);
  } else if ('basic' in placement) {
    const pair = Buffer.from(`${placement.basic.user}:${value}`, 'utf8').toString('base64');

    headers.set('authorization', `Basic ${pair}`);
  } else if ('header' in placement) {
    const headerValue = placement.scheme === undefined ? value : `Bearer ${value}`;

    headers.set(placement.header, headerValue);
  } else {
    url.pathname = url.pathname.replaceAll(/\{credential\}|%7Bcredential%7D/giu, () =>
      encodeURIComponent(value),
    );
  }

  return { url, headers };
}
