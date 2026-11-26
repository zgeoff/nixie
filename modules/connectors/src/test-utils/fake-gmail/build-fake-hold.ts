export interface FakeHold {
  // the request line starts with this, such as `GET /profile`
  readonly line: string;

  // settles once a request that the hold names has arrived, and waits
  readonly reached: Promise<void>;

  // lets the waiting request go on
  readonly release: () => void;

  // called by the fake when a request arrives; settles `reached`, then waits for the release
  readonly arrive: () => Promise<void>;
}

// A hold on the next request whose line starts with `line`: the fake stops that request before it
// answers, so a test can act while a poll sits between two Gmail reads.
export function buildFakeHold(line: string): FakeHold {
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();

  return {
    line,
    reached: reached.promise,
    release: () => released.resolve(),
    arrive: () => {
      reached.resolve();

      return released.promise;
    },
  };
}
