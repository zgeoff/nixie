import { onTestFinished } from 'bun:test';

export interface TestSite {
  // the site's address, such as http://127.0.0.1:41000
  readonly origin: string;

  // the paths that the site was asked for, with their query, in order
  readonly requests: string[];
}

// A site on a loopback port that answers each path with the text the test gives for it, and stops
// when the test ends. The request of a loopback address reaches it, as the test network passes
// those through.
export function startTestSite(pages: Readonly<Record<string, string>>): TestSite {
  const requests: string[] = [];

  const answerRequest = (request: Request): Response => {
    const url = new URL(request.url);

    requests.push(`${url.pathname}${url.search}`);

    const page = pages[url.pathname];

    return page === undefined
      ? new Response('Not found.', { status: 404 })
      : new Response(page, { headers: { 'content-type': 'text/plain' } });
  };

  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerRequest });

  onTestFinished(() => server.stop(true));

  return { origin: `http://127.0.0.1:${String(server.port)}`, requests };
}
