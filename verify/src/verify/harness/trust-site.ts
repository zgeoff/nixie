import { z } from 'zod';

interface TrustSiteArgs {
  readonly domain: string;
  readonly trust: 'read' | 'act';
}

type RequestTrust = (operation: 'trustPlace', args: TrustSiteArgs) => Promise<unknown>;

// Trusts a site as the places page will, which no page offers yet: it adds the entry, or raises the
// level of the one the site has. The server puts a snapshot that holds it in force. Returns the
// short ID of the entry.
export async function trustSite(
  request: RequestTrust,
  domain: string,
  trust: 'read' | 'act',
): Promise<string> {
  const place = await request('trustPlace', { domain, trust });

  return z.string().min(1).parse(place);
}
