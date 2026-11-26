import type { AddressCheck } from '@heynixie/egress';
import { parseIPAddress, toBareHost } from '@heynixie/egress';
import type { DeclaredFetch } from '../stream/create-page-fetches';

export type PickedFetches =
  | {
      readonly status: 'ok';
      readonly fetches: readonly DeclaredFetch[];
      readonly hosts: readonly string[];
    }
  | { readonly status: 'refused' };

// The fetches of a page as the page names them, or a refusal. Each URL is https with no credentials
// and a host with a dot or a public address, and none repeats. The sandbox checks every address
// again at each fetch.
export function pickDeclaredFetches(
  declared: readonly { readonly url: string; readonly refreshMinutes?: number | undefined }[],
  checkAddress: AddressCheck,
): PickedFetches {
  const fetches: DeclaredFetch[] = [];

  for (const entry of declared) {
    if (!URL.canParse(entry.url)) {
      return { status: 'refused' };
    }

    const url = new URL(entry.url);

    const host = toBareHost(url.hostname);
    const isNamed = parseIPAddress(host) === null;

    const isRefused =
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      (isNamed ? !host.includes('.') : !checkAddress(host)) ||
      fetches.some((fetch) => new URL(fetch.url).href === url.href);

    if (isRefused) {
      return { status: 'refused' };
    }

    fetches.push({ url: entry.url, refreshMinutes: entry.refreshMinutes });
  }

  return {
    status: 'ok',
    fetches,
    hosts: [...new Set(fetches.map((fetch) => new URL(fetch.url).host))],
  };
}
