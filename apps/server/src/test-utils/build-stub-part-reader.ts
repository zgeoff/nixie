import invariant from 'tiny-invariant';
import type { PartReader } from '../types';

// A reader that holds only the parts a test gives it, for a declaration whose start reads a few
// of them. A test gives each part as plain data of the fields its start reads.
export function buildStubPartReader<Values>(
  values: Readonly<Partial<Record<keyof Values, unknown>>>,
): PartReader<Values> {
  const get = <Name extends keyof Values>(name: Name): Values[Name] => {
    const value = values[name];

    invariant(value !== undefined, `the stub reader holds no ${String(name)} part`);

    // oxlint-disable-next-line typescript/consistent-type-assertions -- the test gives each part as plain data of the fields that the start under test reads, which no full part type fits
    return value as Values[Name];
  };

  return {
    get,
    find: (name) => (values[name] === undefined ? null : get(name)),
    waitFor: (name) => Promise.resolve(get(name)),
  };
}
