import type { MailHost } from '../types';

const tails = new WeakMap<MailHost, Promise<void>>();

// Runs the work alone among the works of one host, in the order they ask. A send holds it from the
// host's send to its stored record and rule, so a reply in between is read only after both exist.
export async function withHostLock<Result>(
  host: MailHost,
  work: () => Promise<Result>,
): Promise<Result> {
  const previous = tails.get(host) ?? Promise.resolve();
  const done = Promise.withResolvers<void>();

  tails.set(host, done.promise);

  await previous;

  try {
    return await work();
  } finally {
    done.resolve();
  }
}
