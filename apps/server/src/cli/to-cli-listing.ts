// A rule's condition lists as the note and the words. The raw expression stays out of a listing,
// because the words say what the rule checks.
export function toCLIListing(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => toCLIListing(item));
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (key === 'condition' && typeof item === 'object' && item !== null) {
        const fields: [string, unknown][] = Object.entries(item);

        return [[key, Object.fromEntries(fields.filter(([field]) => field !== 'source'))]];
      }

      return [[key, toCLIListing(item)]];
    }),
  );
}
