// The value at a dotted path in a call's arguments, or undefined when any step is missing.
export function findArgument(args: Readonly<Record<string, unknown>>, path: string): unknown {
  let value: unknown = args;

  for (const part of path.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, part)) {
      return undefined;
    }

    value = Object.getOwnPropertyDescriptor(value, part)?.value;
  }

  return value;
}
