// The path of every string argument of an input schema, at any depth: a nested argument is written
// `filter.owner`, and an argument of an array's items `tags[].name`. A declaration with no override
// lists each as content, because a string may carry free text.
export function collectStringArguments(schema: unknown, prefix = ''): readonly string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return [];
  }

  const properties: unknown = Reflect.get(schema, 'properties');
  const items: unknown = Reflect.get(schema, 'items');

  const own =
    typeof properties === 'object' && properties !== null
      ? Object.entries(properties).flatMap(([name, child]) => collectChild(prefix, name, child))
      : [];

  return [...own, ...collectStringArguments(items, `${prefix}[]`)];
}

function collectChild(prefix: string, name: string, child: unknown): readonly string[] {
  const path = prefix === '' ? name : `${prefix}.${name}`;
  const isString = isStringSchema(child);

  return [...(isString ? [path] : []), ...collectStringArguments(child, path)];
}

function isStringSchema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }

  const type: unknown = Reflect.get(schema, 'type');

  return type === 'string' || (Array.isArray(type) && type.includes('string'));
}
