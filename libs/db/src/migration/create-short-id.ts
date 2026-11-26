import { init } from '@paralleldrive/cuid2';

const createCUID = init({ length: 10 });
const drawer: { override: (() => string) | null } = { override: null };

export function createShortID(): string {
  if (NIXIE_TEST_BUILD && drawer.override !== null) {
    return drawer.override();
  }

  return createCUID();
}

// Takes the place of the random draw, so a test can make 2 draws collide. Null restores it.
export function setShortIDDrawer(override: (() => string) | null): void {
  if (!NIXIE_TEST_BUILD) {
    throw new Error('a short ID drawer exists only in a test build');
  }

  drawer.override = override;
}
