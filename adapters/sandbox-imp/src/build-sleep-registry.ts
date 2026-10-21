import type { SleepRegistry } from './build-imp-sandbox';

export function buildSleepRegistry(): SleepRegistry {
  const asleep = new Set<string>();

  return {
    isAsleep: (id) => asleep.has(id),
    setAsleep: (id, isAsleep) => {
      if (isAsleep) {
        asleep.add(id);
      } else {
        asleep.delete(id);
      }
    },
  };
}
