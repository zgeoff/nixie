// Whether the new input schema declares a property, at any depth, that the old one lacks at the
// same place. A new argument may carry a destination or free text that the effect declaration
// leaves out, so a tool that gains one always stops.
export function hasAddedProperty(before: unknown, after: unknown): boolean {
  if (Array.isArray(after)) {
    const olds: readonly unknown[] = Array.isArray(before) ? before : [];

    return after.some((item, index) => hasAddedProperty(olds[index], item));
  }

  if (typeof after !== 'object' || after === null) {
    return false;
  }

  const old = typeof before === 'object' && before !== null && !Array.isArray(before) ? before : {};

  return Object.entries(after).some(([key, value]: [string, unknown]) => {
    const oldValue: unknown = Reflect.get(old, key);

    if (key === 'properties' && typeof value === 'object' && value !== null) {
      return hasAddedProperties(oldValue, value);
    }

    return hasAddedProperty(oldValue, value);
  });
}

function hasAddedProperties(before: unknown, after: object): boolean {
  const old = typeof before === 'object' && before !== null ? before : {};

  return Object.entries(after).some(
    ([name, schema]) =>
      !Object.hasOwn(old, name) || hasAddedProperty(Reflect.get(old, name), schema),
  );
}
