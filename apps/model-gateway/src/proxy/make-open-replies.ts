export interface OpenReplies {
  // records a reply from the moment its request goes upstream; the returned function runs the count
  // of that reply once, and any later call adds nothing
  readonly open: (
    countAtStop: () => Promise<void>,
  ) => (count: () => Promise<void>) => Promise<void>;

  // counts each reply still open, as a stop that ran out of patience does
  readonly countAtStop: () => Promise<void>;
}

export function makeOpenReplies(): OpenReplies {
  const open = new Map<symbol, () => Promise<void>>();

  return {
    open: (countAtStop) => {
      const key = Symbol('open reply');
      let isCounted = false;

      const countOnce = async (count: () => Promise<void>): Promise<void> => {
        if (isCounted) {
          return;
        }

        isCounted = true;

        open.delete(key);

        await count();
      };

      open.set(key, () => countOnce(countAtStop));

      return countOnce;
    },
    countAtStop: async () => {
      await Promise.all([...open.values()].map((countOpen) => countOpen()));
    },
  };
}
