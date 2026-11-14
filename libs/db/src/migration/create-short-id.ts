import { init } from '@paralleldrive/cuid2';

const createCUID = init({ length: 10 });

export function createShortID(): string {
  return createCUID();
}
