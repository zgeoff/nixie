// The schema that a local `$ref` such as `#/$defs/owner` names inside the root schema, or null when
// the ref points outside the root or at nothing.
export function findSchemaRef(root: unknown, ref: string): unknown {
  if (ref === '#') {
    return root;
  }

  if (!ref.startsWith('#/')) {
    return null;
  }

  let node: unknown = root;

  for (const raw of ref.slice(2).split('/')) {
    const segment = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');

    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, segment)) {
      return null;
    }

    node = Reflect.get(node, segment);
  }

  return node;
}
