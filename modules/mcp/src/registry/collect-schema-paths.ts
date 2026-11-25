// The path of every schema of an input schema that the filter accepts, at any depth: `filter.owner`
// for a nested property, `tags[]` for an array's items, `labels.*` for the free keys of an object,
// and the path of the union for a member of a union.
export function collectSchemaPaths(
  schema: unknown,
  accepts: (schema: object) => boolean,
): readonly string[] {
  return [...new Set(collectPaths(schema, '', accepts))];
}

function collectPaths(
  schema: unknown,
  path: string,
  accepts: (schema: object) => boolean,
): readonly string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return [];
  }

  const properties: unknown = Reflect.get(schema, 'properties');
  const additional: unknown = Reflect.get(schema, 'additionalProperties');
  const own = path !== '' && accepts(schema) ? [path] : [];

  const named =
    typeof properties === 'object' && properties !== null
      ? Object.entries(properties).flatMap(([name, child]) =>
          collectPaths(child, join(path, name), accepts),
        )
      : [];

  const free = collectPaths(additional, join(path, '*'), accepts);
  const items = collectPaths(Reflect.get(schema, 'items'), `${path}[]`, accepts);

  const members = ['anyOf', 'oneOf', 'allOf'].flatMap((keyword) => {
    const union: unknown = Reflect.get(schema, keyword);

    return Array.isArray(union)
      ? union.flatMap((member) => collectPaths(member, path, accepts))
      : [];
  });

  return [...own, ...named, ...free, ...items, ...members];
}

function join(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}
