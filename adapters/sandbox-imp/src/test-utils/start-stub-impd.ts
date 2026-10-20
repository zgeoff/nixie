import { onTestFinished } from 'bun:test';

// One error impd answers a call with, as its oRPC contract defines it.
export interface StubImpdError {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

// Starts a local stand-in for impd's HTTP API that refuses every call with the error, in the oRPC
// envelope impd sends, so a test drives the real imp client against impd's refusal. It returns the
// URL the port connects to, and stops when the test finishes.
export function startStubImpd(error: StubImpdError): string {
  const refuseRequest = () =>
    Response.json({ json: { defined: true, ...error } }, { status: error.status });

  const impd = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: refuseRequest,
  });

  onTestFinished(() => impd.stop(true));

  return impd.url.href;
}
