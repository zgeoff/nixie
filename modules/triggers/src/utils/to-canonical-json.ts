// Sorted keys and no whitespace, so 2 equal values give one text. An undefined member is left out.
export function toCanonicalJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toCanonicalJSON(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, member]) => `${JSON.stringify(key)}:${toCanonicalJSON(member)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}
