import { findSchemaRef } from './find-schema-ref';
import { omitSchemaRef } from './omit-schema-ref';

// The name of every argument that an input schema holds at its top: the properties of the root and
// of each member of its anyOf, oneOf and allOf, with a local `$ref` read as the schema it names, beside the keywords the schema holds with it.
export function collectTopLevelArguments(inputSchema: unknown): ReadonlySet<string> {
  return new Set(collectNames(inputSchema, { root: inputSchema, refs: [] }));
}

interface Walk {
  readonly root: unknown;
  readonly refs: readonly string[];
}

function collectNames(schema: unknown, walk: Walk): readonly string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return [];
  }

  const ref: unknown = Reflect.get(schema, '$ref');

  if (typeof ref === 'string') {
    const target = walk.refs.includes(ref)
      ? []
      : collectNames(findSchemaRef(walk.root, ref), { ...walk, refs: [...walk.refs, ref] });

    return [...target, ...collectNames(omitSchemaRef(schema), walk)];
  }

  const properties: unknown = Reflect.get(schema, 'properties');

  const named =
    typeof properties === 'object' && properties !== null && !Array.isArray(properties)
      ? Object.keys(properties)
      : [];

  const members = ['anyOf', 'oneOf', 'allOf'].flatMap((keyword) => {
    const union: unknown = Reflect.get(schema, keyword);

    return Array.isArray(union) ? union.flatMap((member) => collectNames(member, walk)) : [];
  });

  return [...named, ...members];
}
