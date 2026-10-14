import { init } from '@paralleldrive/cuid2';

const createCUID = init({ length: 10 });

// Makes a new short ID, a 10-character cuid2 such as k3x9m2p7qa: a lowercase letter, then letters
// and digits. A record the model reads names itself by its short ID, so the model's context holds
// 10 characters in place of a 36-character UUID.
export function createShortID(): string {
  return createCUID();
}
