// The path of every string argument of an input schema, at any depth: `filter.owner` for a nested
// one, `tags[]` for an array's items, `labels.*` for the free keys of an object, and the path of the
// union for a member of a union. A declaration with no override lists each as content.
export function collectStringArguments(schema: unknown): readonly string[] {
  return [...new Set(collectPaths(schema, ''))];
}

function collectPaths(schema: unknown, path: string): readonly string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return [];
  }

  const properties: unknown = Reflect.get(schema, 'properties');
  const additional: unknown = Reflect.get(schema, 'additionalProperties');
  const own = path !== '' && isStringSchema(schema) ? [path] : [];

  const named =
    typeof properties === 'object' && properties !== null
      ? Object.entries(properties).flatMap(([name, child]) => collectPaths(child, join(path, name)))
      : [];

  const freePath = join(path, '*');
  const free = collectPaths(additional, freePath);
  const items = collectPaths(Reflect.get(schema, 'items'), `${path}[]`);

  const members = ['anyOf', 'oneOf', 'allOf'].flatMap((keyword) => {
    const union: unknown = Reflect.get(schema, keyword);

    return Array.isArray(union) ? union.flatMap((member) => collectPaths(member, path)) : [];
  });

  return [...own, ...named, ...free, ...items, ...members];
}

function isStringSchema(schema: object): boolean {
  const type: unknown = Reflect.get(schema, 'type');

  return type === 'string' || (Array.isArray(type) && type.includes('string'));
}

function join(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}
