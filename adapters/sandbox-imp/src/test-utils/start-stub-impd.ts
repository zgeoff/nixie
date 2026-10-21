import { onTestFinished } from 'bun:test';

export interface StubImpdError {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

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
