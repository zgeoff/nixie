import { onTestFinished } from 'bun:test';
import { createTestCertificate } from './create-test-certificate';

export interface TestSiteOptions {
  // the names the site's certificate covers
  readonly names: readonly string[];

  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

export interface TestSite {
  readonly port: number;

  // the site's certificate, the one root a client passes to trust it
  readonly ca: string;

  // every request the site received, in order
  readonly requests: readonly RecordedRequest[];
}

// a request as it arrived, copied before the handler runs, since Bun reuses a Request after it
interface RecordedRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

// Starts an HTTPS site on 127.0.0.1 with a self-signed certificate for the names, and stops it when
// the test finishes. It records each request before the test's handler answers it.
export async function startTestSite(options: TestSiteOptions): Promise<TestSite> {
  const certificate = await createTestCertificate(options.names);

  const requests: RecordedRequest[] = [];

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: { cert: certificate.cert, key: certificate.key },
    fetch: (request) => {
      requests.push({ url: request.url, headers: Object.fromEntries(request.headers) });

      return options.fetch(request);
    },
  });

  onTestFinished(() => server.stop(true));

  return { port: server.port ?? 0, ca: certificate.cert, requests };
}
