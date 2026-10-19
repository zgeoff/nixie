import { MissingPartError } from './missing-part-error';
import { PartCycleError } from './part-cycle-error';
import { PartNotStartedError } from './part-not-started-error';
import type { AnyPartDeclaration, PartDeclaration, PartGraph, PartReader } from './types';

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
    waitFor: (name) => state.getWaiter(name).promise,
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

// the started parts and the waiter for each part, read and changed only through these functions
interface GraphState<Values> {
  readonly findStarted: <Name extends keyof Values>(
    name: Name,
  ) => { readonly value: Values[Name] } | undefined;
  readonly setStarted: <Name extends keyof Values>(name: Name, value: Values[Name]) => void;
  readonly getWaiter: <Name extends keyof Values>(name: Name) => PromiseWithResolvers<Values[Name]>;
}

function buildGraphState<Values>(order: readonly AnyPartDeclaration<Values>[]): GraphState<Values> {
  const started: { [Name in keyof Values]?: { readonly value: Values[Name] } } = {};
  const waiters: { [Name in keyof Values]?: PromiseWithResolvers<Values[Name]> } = {};

  const addWaiter = <Name extends keyof Values>(name: Name): PromiseWithResolvers<Values[Name]> => {
    const waiter = Promise.withResolvers<Values[Name]>();

    // a caller that never waits on a part leaves its rejection unread
    void waitForSettled(waiter.promise);
    waiters[name] = waiter;

    return waiter;
  };

  for (const declaration of order) {
    addWaiter(declaration.name);
  }

  return {
    findStarted: (name) => started[name],
    setStarted: (name, value) => {
      started[name] = { value };
    },
    getWaiter: (name) => {
      const waiter = waiters[name];

      if (waiter === undefined) {
        throw new MissingPartError('the caller', String(name));
      }

      return waiter;
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

async function runParts<Values>(
  order: readonly AnyPartDeclaration<Values>[],
  state: GraphState<Values>,
  options: PartGraphOptions,
): Promise<void> {
  try {
    for (const declaration of order) {
      options.signal?.throwIfAborted();

      await startPart(declaration, state);
    }
  } catch (error) {
    for (const declaration of order) {
      state.getWaiter(declaration.name).reject(error);
    }

    throw error;
  }
}

async function startPart<Values, Name extends keyof Values>(
  declaration: PartDeclaration<Values, Name>,
  state: GraphState<Values>,
): Promise<void> {
  const value = await declaration.start(buildPartReader(declaration, state));

  state.setStarted(declaration.name, value);
  state.getWaiter(declaration.name).resolve(value);
}

// the reader a part's start gets, which reads only the parts its declaration names
function buildPartReader<Values, Name extends keyof Values>(
  declaration: PartDeclaration<Values, Name>,
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

      return state.findStarted(name)?.value ?? null;
    },
    get: (name) => {
      requireDeclared(name);

      const started = state.findStarted(name);

      if (started === undefined) {
        throw new PartNotStartedError(String(name));
      }

      return started.value;
    },
    waitFor: (name) => {
      requireDeclared(name);

      return state.getWaiter(name).promise;
    },
  };
}
