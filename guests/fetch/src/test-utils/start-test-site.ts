import { onTestFinished } from 'bun:test';
import { createTestCertificate } from './create-test-certificate';

export interface TestSiteOptions {
  readonly names: readonly string[];

  readonly respond: (request: Request) => Response | Promise<Response>;
}

interface RecordedRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface TestSite {
  readonly port: number;

  readonly ca: string;

  readonly requests: readonly RecordedRequest[];
}

export async function startTestSite(options: TestSiteOptions): Promise<TestSite> {
  const certificate = await createTestCertificate(options.names);

  const requests: RecordedRequest[] = [];

  const answerRequest = (request: Request): Response | Promise<Response> => {
    // Bun reuses a Request after the handler runs, so the site copies each request first.
    requests.push({ url: request.url, headers: Object.fromEntries(request.headers) });

    return options.respond(request);
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: { cert: certificate.cert, key: certificate.key },
    fetch: answerRequest,
  });

  onTestFinished(() => server.stop(true));

  return { port: server.port ?? 0, ca: certificate.cert, requests };
}
