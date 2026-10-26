export interface StubHeldRun<Item, Output> {
  run: (item: Item) => Promise<Output>;
  started: Item[];
  release: (item: Item) => void;
  releaseAll: () => void;
}

export function buildStubHeldRun<Item, Output>(
  buildOutput: (item: Item) => Output,
): StubHeldRun<Item, Output> {
  const gates = new Map<Item, PromiseWithResolvers<void>>();

  const started: Item[] = [];
  let isAllReleased = false;

  const getGate = (item: Item): PromiseWithResolvers<void> => {
    const existing = gates.get(item);

    if (existing !== undefined) {
      return existing;
    }

    const gate = Promise.withResolvers<void>();

    gates.set(item, gate);

    if (isAllReleased) {
      gate.resolve();
    }

    return gate;
  };

  return {
    run: async (item) => {
      started.push(item);

      await getGate(item).promise;

      return buildOutput(item);
    },
    started,
    release: (item) => {
      getGate(item).resolve();
    },
    releaseAll: () => {
      isAllReleased = true;

      for (const gate of gates.values()) {
        gate.resolve();
      }
    },
  };
}
