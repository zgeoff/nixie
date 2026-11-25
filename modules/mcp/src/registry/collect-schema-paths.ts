import { findSchemaRef } from './find-schema-ref';
import { omitSchemaRef } from './omit-schema-ref';

// The path of every schema of an input schema that the filter accepts, at any depth: `filter.owner`
// for a nested property, `tags[]` for an array's or a tuple's items, `labels.*` for the free keys of
// an object, and the path of the union for a member of a union. A local `$ref` reads as its target, beside the keywords the schema holds with it.
export function collectSchemaPaths(
  schema: unknown,
  accepts: (schema: object) => boolean,
): readonly string[] {
  return [...new Set(collectPaths(schema, { root: schema, path: '', refs: [] }, accepts))];
}

interface Walk {
  readonly root: unknown;
  readonly path: string;

  // the refs being followed, so a schema that refers to itself ends the walk
  readonly refs: readonly string[];
}

function collectPaths(
  schema: unknown,
  walk: Walk,
  accepts: (schema: object) => boolean,
): readonly string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return [];
  }

  const ref: unknown = Reflect.get(schema, '$ref');

  if (typeof ref === 'string') {
    const target = walk.refs.includes(ref)
      ? []
      : collectPaths(
          findSchemaRef(walk.root, ref),
          { ...walk, refs: [...walk.refs, ref] },
          accepts,
        );

    return [...target, ...collectPaths(omitSchemaRef(schema), walk, accepts)];
  }

  const path = walk.path;
  const properties: unknown = Reflect.get(schema, 'properties');
  const own = path !== '' && accepts(schema) ? [path] : [];

  const named =
    typeof properties === 'object' && properties !== null
      ? Object.entries(properties).flatMap(([name, child]) =>
          collectPaths(child, { ...walk, path: join(path, name) }, accepts),
        )
      : [];

  const free = collectPaths(
    Reflect.get(schema, 'additionalProperties'),
    { ...walk, path: join(path, '*') },
    accepts,
  );

  const prefix: unknown = Reflect.get(schema, 'prefixItems');
  const tuple: unknown[] = Array.isArray(prefix) ? prefix : [];

  const elements = [Reflect.get(schema, 'items'), ...tuple].flatMap((element) =>
    collectPaths(element, { ...walk, path: `${path}[]` }, accepts),
  );

  const members = ['anyOf', 'oneOf', 'allOf'].flatMap((keyword) => {
    const union: unknown = Reflect.get(schema, keyword);

    return Array.isArray(union)
      ? union.flatMap((member) => collectPaths(member, walk, accepts))
      : [];
  });

  return [...own, ...named, ...free, ...elements, ...members];
}

function join(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}
