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
      readonly output: string;
    }
  | {
      readonly outcome: 'refused';
      readonly exit: NixieExit;
      readonly output: string;
    }
  | {
      readonly outcome: 'timeout';
      readonly stage: 'listening' | 'ready';
      readonly timeoutMs: number;
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
// open and its migrations, or exits before it. A start that does neither within the wait is a
// timeout result with the process output, and so is a health answer that takes longer than the wait.
export async function readReleaseStartOutcome(
  nixie: ReleaseProcess,
  options: ReadReleaseStartOutcomeOptions,
): Promise<ReleaseStartOutcome> {
  // waitForLogEvent rejects when the process exits first, and the exit settles the race then
  const never = Promise.withResolvers<FirstEvent>();

  const first = await Promise.race([
    readListeningEvent(nixie, never.promise),
    nixie.exited.then((exit): FirstEvent => ({ kind: 'exited', exit })),
    Bun.sleep(options.timeoutMs).then((): FirstEvent => ({ kind: 'timeout' })),
  ]);

  if (first.kind === 'timeout') {
    return {
      outcome: 'timeout',
      stage: 'listening',
      timeoutMs: options.timeoutMs,
      output: nixie.readOutput(),
    };
  }

  if (first.kind === 'exited') {
    return { outcome: 'refused', exit: first.exit, output: nixie.readOutput() };
  }

  try {
    // the signal covers the body as well as the headers
    const ready = await fetch(`http://127.0.0.1:${String(first.port)}/health/ready`, {
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    return {
      outcome: 'started',
      readyStatus: ready.status,
      readyBody: await ready.text(),
      output: nixie.readOutput(),
    };
  } catch {
    return {
      outcome: 'timeout',
      stage: 'ready',
      timeoutMs: options.timeoutMs,
      output: nixie.readOutput(),
    };
  }
}

async function readListeningEvent(
  nixie: ReleaseProcess,
  exitSettles: Promise<FirstEvent>,
): Promise<FirstEvent> {
  try {
    const line = await nixie.waitForLogEvent('http.listening');

    return { kind: 'listening', port: line['port'] };
  } catch {
    return exitSettles;
  }
}
