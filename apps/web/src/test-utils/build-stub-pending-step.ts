export interface StubPendingStep {
  readonly run: () => Promise<void>;

  readonly started: Promise<void>;

  readonly finish: () => void;
}

export function buildStubPendingStep(): StubPendingStep {
  const started = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();

  return {
    finish: () => {
      finished.resolve();
    },
    run: () => {
      started.resolve();

      return finished.promise;
    },
    started: started.promise,
  };
}
