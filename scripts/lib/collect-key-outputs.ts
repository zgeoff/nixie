// A workflow's toJSON(needs) or toJSON(steps) holds one entry per job or step, each with its
// outputs. This keeps the entries named by one of the keys, and gives each one's named output.
export function collectKeyOutputs(
  contextJSON: string,
  keys: readonly string[],
  output: string,
): Record<string, string> {
  const context: unknown = JSON.parse(contextJSON);

  if (typeof context !== 'object' || context === null) {
    throw new TypeError('the workflow context is not an object');
  }

  const collected: Record<string, string> = {};

  for (const [name, entry] of Object.entries(context)) {
    if (!keys.includes(name)) {
      continue;
    }

    const value: unknown = entry?.outputs?.[output];

    if (typeof value !== 'string') {
      throw new TypeError(`${name} gives no ${output} output`);
    }

    collected[name] = value;
  }

  return collected;
}
