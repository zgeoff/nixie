import { collectSchemaPaths } from './collect-schema-paths';

// The path of every string argument of an input schema, at any depth, including array items and
// each member of an anyOf, oneOf or allOf. A declaration with no override lists each as content.
export function collectStringArguments(schema: unknown): readonly string[] {
  return collectSchemaPaths(schema, isStringSchema);
}

function isStringSchema(schema: object): boolean {
  const type: unknown = Reflect.get(schema, 'type');

  return type === 'string' || (Array.isArray(type) && type.includes('string'));
}
