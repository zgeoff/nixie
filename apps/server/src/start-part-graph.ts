import { MissingPartError } from './missing-part-error';
import { PartCycleError } from './part-cycle-error';
import { PartNotStartedError } from './part-not-started-error';
import type { AnyPartDeclaration, PartGraph, PartReader } from './types';

export interface PartGraphOptions {
  // checked before each part starts, so a stop ends the start at the next part
  readonly signal?: AbortSignal;
}

// Starts the parts one at a time: each once every part it needs is ready, and parts that need
// nothing of each other in the order declared. A name no declaration has, or a cycle of needs,
// throws before any part starts, and a part that fails leaves every part after it unstarted.
export function startPartGraph<Values>(
  declarations: readonly AnyPartDeclaration<Values>[],
  options: PartGraphOptions = {},
): PartGraph<Values> {
  const order = planPartOrder(declarations);
  const state = buildGraphState(order);
  const done = runParts(order, state, options);

  // a start failure reaches each caller through done or waitFor, so no rejection goes unhandled
  void waitForSettled(done);

  return {
    waitFor: (name) => state.readWaiter(name).promise,
    done,
  };
}

// the declarations in start order, after each one's names are checked against the rest
function planPartOrder<Values>(
  declarations: readonly AnyPartDeclaration<Values>[],
): readonly AnyPartDeclaration<Values>[] {
  const named = new Set(declarations.map((declaration) => declaration.name));

  for (const declaration of declarations) {
    for (const name of [...declaration.needs, ...(declaration.uses ?? [])]) {
      if (!named.has(name)) {
        throw new MissingPartError(String(declaration.name), String(name));
      }
    }
  }

  const order: AnyPartDeclaration<Values>[] = [];
  const pending = [...declarations];

  while (pending.length > 0) {
    order.push(...pending.splice(pickNextPart(pending, order), 1));
  }

  return order;
}

// the index of the first pending declaration whose needs all come earlier in the order
function pickNextPart<Values>(
  pending: readonly AnyPartDeclaration<Values>[],
  order: readonly AnyPartDeclaration<Values>[],
): number {
  const placed = new Set(order.map((declaration) => declaration.name));

  const next = pending.findIndex((declaration) =>
    declaration.needs.every((name) => placed.has(name)),
  );

  if (next === -1) {
    throw new PartCycleError(pending.map((declaration) => String(declaration.name)));
  }

  return next;
}

interface GraphState<Values> {
  readonly started: Map<keyof Values, unknown>;
  readonly readWaiter: <Name extends keyof Values>(
    name: Name,
  ) => PromiseWithResolvers<Values[Name]>;
}

function buildGraphState<Values>(order: readonly AnyPartDeclaration<Values>[]): GraphState<Values> {
  const waiters = new Map<keyof Values, PromiseWithResolvers<unknown>>(
    order.map((declaration) => [declaration.name, Promise.withResolvers<unknown>()]),
  );

  for (const waiter of waiters.values()) {
    // a caller that never waits on a part leaves its rejection unread
    void waitForSettled(waiter.promise);
  }

  return {
    started: new Map(),
    readWaiter: <Name extends keyof Values>(name: Name) => {
      const waiter = waiters.get(name);

      if (waiter === undefined) {
        throw new MissingPartError('the caller', String(name));
      }

      return waiter as PromiseWithResolvers<Values[Name]>;
    },
  };
}

async function runParts<Values>(
  order: readonly AnyPartDeclaration<Values>[],
  state: GraphState<Values>,
  options: PartGraphOptions,
): Promise<void> {
  try {
    for (const declaration of order) {
      options.signal?.throwIfAborted();

      // oxlint-disable-next-line no-await-in-loop -- each part starts after the parts it needs
      const value = await declaration.start(buildPartReader(declaration, state));

      state.started.set(declaration.name, value);
      state.readWaiter(declaration.name).resolve(value);
    }
  } catch (error) {
    for (const declaration of order) {
      state.readWaiter(declaration.name).reject(error);
    }

    throw error;
  }
}

// the reader a part's start gets, which reads only the parts its declaration names
function buildPartReader<Values>(
  declaration: AnyPartDeclaration<Values>,
  state: GraphState<Values>,
): PartReader<Values> {
  const declared = new Set<keyof Values>([...declaration.needs, ...(declaration.uses ?? [])]);

  const requireDeclared = (name: keyof Values): void => {
    if (!declared.has(name)) {
      throw new MissingPartError(String(declaration.name), String(name));
    }
  };

  return {
    find: (name) => {
      requireDeclared(name);

      return state.started.has(name) ? (state.started.get(name) as Values[typeof name]) : null;
    },
    get: (name) => {
      requireDeclared(name);

      if (!state.started.has(name)) {
        throw new PartNotStartedError(String(name));
      }

      return state.started.get(name) as Values[typeof name];
    },
    waitFor: (name) => {
      requireDeclared(name);

      return state.readWaiter(name).promise;
    },
  };
}

async function waitForSettled(pending: Promise<unknown>): Promise<void> {
  try {
    await pending;
  } catch {
    // the caller that waits on the start reads its failure
  }
}
