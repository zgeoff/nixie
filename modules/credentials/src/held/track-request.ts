export interface TrackedRequest {
  readonly signal: AbortSignal;
  readonly end: () => void;
}

// Records one request in flight on a credential, so a removal can abort it.
export function trackRequest(
  requests: Map<string, Set<AbortController>>,
  credentialID: string,
): TrackedRequest {
  const controller = new AbortController();

  const active = requests.get(credentialID) ?? new Set<AbortController>();

  active.add(controller);
  requests.set(credentialID, active);

  return {
    signal: controller.signal,
    end: () => {
      active.delete(controller);
    },
  };
}
