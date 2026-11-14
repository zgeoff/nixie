import type { NixieExit } from '@heynixie/testing';

interface ReleaseProcess {
  readonly waitForLogEvent: (event: string) => Promise<Readonly<Record<string, unknown>>>;
  readonly exited: Promise<NixieExit>;
  readonly readOutput: () => string;
}

export type ReleaseStartOutcome =
  | {
      readonly outcome: 'started';
      readonly readyStatus: number;
      readonly readyBody: string;
    }
  | {
      readonly outcome: 'refused';
      readonly exit: NixieExit;
      readonly output: string;
    };

interface ReadReleaseStartOutcomeOptions {
  readonly timeoutMs: number;
}

type FirstEvent =
  | { readonly kind: 'listening'; readonly port: unknown }
  | { readonly kind: 'exited'; readonly exit: NixieExit }
  | { readonly kind: 'timeout' };

// A release started on a data directory either logs http.listening, which follows the database
// open and its migrations, or exits before it. A start that does neither within the wait throws
// with the process output.
export async function readReleaseStartOutcome(
  nixie: ReleaseProcess,
  options: ReadReleaseStartOutcomeOptions,
): Promise<ReleaseStartOutcome> {
  // waitForLogEvent rejects when the process exits first, and the exit settles the race then
  const never = Promise.withResolvers<FirstEvent>();

  const first = await Promise.race([
    nixie.waitForLogEvent('http.listening').then(
      (line): FirstEvent => ({ kind: 'listening', port: line['port'] }),
      () => never.promise,
    ),
    nixie.exited.then((exit): FirstEvent => ({ kind: 'exited', exit })),
    Bun.sleep(options.timeoutMs).then((): FirstEvent => ({ kind: 'timeout' })),
  ]);

  if (first.kind === 'timeout') {
    throw new Error(
      `the release neither listened nor exited within ${String(options.timeoutMs)} ms:\n${nixie.readOutput()}`,
    );
  }

  if (first.kind === 'exited') {
    return { outcome: 'refused', exit: first.exit, output: nixie.readOutput() };
  }

  const ready = await fetch(`http://127.0.0.1:${String(first.port)}/health/ready`);

  return { outcome: 'started', readyStatus: ready.status, readyBody: await ready.text() };
}
