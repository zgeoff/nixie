import { z } from 'zod';

interface TrustSiteArgs {
  readonly domain: string;
  readonly trust: 'read';
}

type RequestTrust = (operation: 'trustPlace', args: TrustSiteArgs) => Promise<unknown>;

// Trusts a site at read as the places page will, which no page offers yet. The server adds the
// entry and puts a snapshot that holds it in force. Returns the short ID of the entry.
export async function trustSite(request: RequestTrust, domain: string): Promise<string> {
  const place = await request('trustPlace', { domain, trust: 'read' });

  return z.string().min(1).parse(place);
}
