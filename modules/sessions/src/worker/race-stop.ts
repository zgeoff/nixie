// Settles with the work's result, or rejects with the signal's reason when the signal aborts first.
// The work goes on after a loss, so the caller keeps its promise to tidy up what it makes.
export function raceStop<Value>(work: Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  const stopped = Promise.withResolvers<never>();

  const onAbort = () => {
    stopped.reject(signal.reason);
  };

  signal.addEventListener('abort', onAbort, { once: true });

  return Promise.race([work, stopped.promise]).finally(() => {
    signal.removeEventListener('abort', onAbort);
  });
}
