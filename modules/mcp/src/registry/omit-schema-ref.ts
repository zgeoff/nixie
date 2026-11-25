// The keywords a schema holds beside its local `$ref`, which apply to the same value as the schema
// the ref names.
export function omitSchemaRef(schema: object): object {
  return Object.fromEntries(Object.entries(schema).filter(([keyword]) => keyword !== '$ref'));
}
