import type { FaultPointArrival } from './start-nixie-process';
import type { HarnessMessage, NixieMessage } from './types';

interface NixieChannel {
  readonly ready: Promise<void>;
  readonly receive: (message: NixieMessage) => void;
  readonly waitForArrival: (point: string, workID?: string) => Promise<FaultPointArrival>;
  readonly sendRequest: (
    send: (message: HarnessMessage) => void,
    operation: string,
    args: unknown,
  ) => Promise<unknown>;

  readonly close: (error: Error) => void;
}

export function createNixieChannel(): NixieChannel {
  const ready = Promise.withResolvers<void>();
  const arrivals = buildArrivalQueue();

  const requests = new Map<number, PromiseWithResolvers<unknown>>();

  const counter = { next: 1 };

  // Bun fails a test on an unhandled rejection, and a test whose nixie must refuse to start never
  // waits for ready.
  void waitQuietly(ready.promise);

  return {
    ready: ready.promise,
    receive: (message) => {
      if (message.type === 'ready') {
        ready.resolve();
      } else if (message.type === 'arrived') {
        arrivals.add({ arrivalID: message.arrivalID, point: message.point, work: message.work });
      } else {
        applyReply(requests, message);
      }
    },
    waitForArrival: arrivals.waitFor,
    sendRequest: (send, operation, args) => {
      const requestID = counter.next;
      const reply = Promise.withResolvers<unknown>();

      counter.next += 1;

      requests.set(requestID, reply);
      void waitQuietly(reply.promise);
      send({ type: 'request', requestID, operation, args });

      return reply.promise;
    },
    close: (error) => {
      ready.reject(error);
      arrivals.close(error);

      for (const pending of requests.values()) {
        pending.reject(error);
      }

      requests.clear();
    },
  };
}

interface ArrivalWaiter {
  readonly point: string;
  readonly workID: string | undefined;
  readonly resolve: (arrival: FaultPointArrival) => void;
  readonly reject: (error: Error) => void;
}

interface ArrivalQueue {
  readonly add: (arrival: FaultPointArrival) => void;
  readonly waitFor: (point: string, workID?: string) => Promise<FaultPointArrival>;
  readonly close: (error: Error) => void;
}

function buildArrivalQueue(): ArrivalQueue {
  const unclaimed: FaultPointArrival[] = [];
  const waiters: ArrivalWaiter[] = [];
  const state: { closed: Error | null } = { closed: null };

  return {
    add: (arrival) => {
      const index = waiters.findIndex((waiter) => isMatch(arrival, waiter.point, waiter.workID));
      const [waiter] = index === -1 ? [] : waiters.splice(index, 1);

      if (waiter === undefined) {
        unclaimed.push(arrival);
      } else {
        waiter.resolve(arrival);
      }
    },
    waitFor: (point, workID) => {
      const index = unclaimed.findIndex((arrival) => isMatch(arrival, point, workID));
      const [arrival] = index === -1 ? [] : unclaimed.splice(index, 1);

      if (arrival !== undefined) {
        return Promise.resolve(arrival);
      }

      if (state.closed !== null) {
        return Promise.reject(state.closed);
      }

      const waiter = Promise.withResolvers<FaultPointArrival>();

      waiters.push({ point, workID, resolve: waiter.resolve, reject: waiter.reject });

      return waiter.promise;
    },
    close: (error) => {
      state.closed = error;

      for (const waiter of waiters.splice(0)) {
        waiter.reject(error);
      }
    },
  };
}

function isMatch(arrival: FaultPointArrival, point: string, workID: string | undefined): boolean {
  return arrival.point === point && (workID === undefined || arrival.work.id === workID);
}

async function waitQuietly(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {}
}

type PendingRequests = Map<number, PromiseWithResolvers<unknown>>;

type NixieReply = Extract<NixieMessage, { type: 'reply' }>;

function applyReply(requests: PendingRequests, reply: NixieReply): void {
  const pending = requests.get(reply.requestID);

  requests.delete(reply.requestID);

  if (reply.error === undefined) {
    pending?.resolve(reply.result);
  } else {
    pending?.reject(new Error(reply.error));
  }
}
